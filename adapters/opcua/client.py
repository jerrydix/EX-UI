import asyncio
import copy
import logging
import json
import redis.asyncio as redis
import time
import ssl
import websockets

from asyncua import Client, Node, ua

EQFILEMOUNTPT = '/eqconfig'

url = ""
nsidx = 1

datapoint_counter = 0
datapoint_timer = 0

websocket_timeout_sec = 1

logging.basicConfig(level=logging.WARN)
_logger = logging.getLogger('asyncua')

datasource = {}
node_datapoints = {}
input_configs = {}
sequence_configs = {}
datapoints_dict = {}

redis_queue = asyncio.Queue(maxsize=128)

ws_connections = set()
cmd_queue = asyncio.Queue(maxsize=128)
ws_queue = asyncio.Queue(maxsize=128)

async def get_opcua_nodes_recursive(uaclient, datapoints, nodes):
    for p in datapoints:
        if 'opcua' in p:

            if 'key' in p:
                datapoints_dict[p['key']] = p
                
            uaconfig = p['opcua']
            node = await uaclient.nodes.root.get_child(uaconfig['path'])
            nodes.append(node)

            if node.nodeid.to_string() in node_datapoints:
                node_datapoints[node.nodeid.to_string()].append(p)
            else:
                node_datapoints[node.nodeid.to_string()] = [p]

            print(f'Added datapoint {p}')
        elif 'type' in p and p['type'] == 'folder' and 'values' in p:
            await get_opcua_nodes_recursive(uaclient, p['values'], nodes)

def get_input_configs_recursive(inputs, configs):
    for i in inputs:
        if 'opcua' in i:
            input_config = i['opcua']
            configs[i['key']] = input_config
        elif 'type' in i and i['type'] == 'folder' and 'values' in i:
            get_input_configs_recursive(i['values'], configs)

def get_output_config_in_sequence(sequence_config, output_key):
    for o in sequence_config['outputs']:
        if o['key'] == output_key:
            return o

    return None

def get_sequence_configs(sequences, configs):
    for s in sequences:
        for i in range(s['amount']):
            seqCopy = copy.deepcopy(s)
            seqCopy['index'] = i
            
            if seqCopy['amount'] == 1:
                seqCopy['key'] = seqCopy['type']
            else:   
                seqCopy['key'] = seqCopy['type'] + str(i)  

            if seqCopy['key'] == 'redline_trigger_sequence':
                seqCopy['outputs'] = []
                for redline in datasource['Redlines']:
                    seqCopy['outputs'].append(redline['key'])
                
            configs[seqCopy['key']] = seqCopy

async def parse_eq_config():
    global datasource
    global url

    f = open(EQFILEMOUNTPT)
    data = json.load(f)

    datasources = data['datasources']

    # TODO: Support multiple sources
    for source in filter(lambda s: s['type'] == "opcua", datasources):
        datasource = source
        break

    if datasource == {}:
        print('ERROR: no datasource found')

    opcua_ip = datasource['Source']['ip']
    opcua_port = datasource['Source']['port']
    url = f"opc.tcp://{opcua_ip}:{opcua_port}/"

    if 'Sequences' in datasource:
        get_sequence_configs(datasource['Sequences'], sequence_configs)
        print(f"Got sequence configs:\n{sequence_configs}")


async def opcua_task():
    global uaclient

    print("Startuing OPCUA client")
    print(f"Connecting to {url} ...")
    uaclient = Client(url=url)

    async with uaclient:
        get_input_configs_recursive(datasource['Controlls']['Inputs'], input_configs)

        nodes = []
        await get_opcua_nodes_recursive(uaclient, datasource['datapoints'], nodes)

        while True:
            results = await asyncio.gather(*[node.read_value() for node in nodes])
            #await asyncio.gather(*[opcua_data_handler(nodes[i], results[i]) for i in range(len(results))])
            await opcua_data_handler(nodes, results)

            await asyncio.sleep(0.1)

async def opcua_data_handler(nodes, results):
    global redis_queue
    global datapoint_timer
    global datapoint_counter

    redis_kvps = []

    redis_key = f"{datasource['key']}:DATA"
    redis_value = { }
    
    for i in range(len(results)):
        node = nodes[i]
        value = results[i]
        datapoints = node_datapoints[node.nodeid.to_string()]

        for p in datapoints:
            uaconfig = p['opcua']
            datakey = p['key']

            if 'index' in uaconfig:
                redis_value[datakey] = value[uaconfig['index']]
            else:
                redis_value[datakey] = value

    redis_queue.put_nowait((redis_key, redis_value))

    datapoint_counter = datapoint_counter + 1
    if time.time() - datapoint_timer >= 1:
        print(f"{time.time()} STAT {datapoint_counter} pps")
        datapoint_counter = 0
        datapoint_timer = time.time()

async def command_task():
    global uaclient

    while True:
        (ws, msg) = await cmd_queue.get()

        resp = []

        for cmd in msg['commands']:
            if cmd['cmd'] == 'set':
                await handle_cmd_set(cmd)
            elif cmd['cmd'] == 'load_sequence':
                await handle_cmd_load_sequence(cmd)
            elif cmd['cmd'] == 'download_sequence':
                resp.append(await handle_cmd_download_sequence(cmd))
            elif cmd['cmd'] == 'start_sequence':
                await handle_cmd_start_sequence(cmd)
            elif cmd['cmd'] == 'load_calibs':
                await handle_cmd_load_calibs(cmd)
            elif cmd['cmd'] == 'download_calibs':
                resp.append(await handle_cmd_download_calibs(cmd))
            elif cmd['cmd'] == 'load_redlines':
                await handle_cmd_load_redlines(cmd)
            elif cmd['cmd'] == 'load_redline_delays':
                await handle_cmd_load_redline_delays(cmd)
            elif cmd['cmd'] == 'download_redlines':
                resp.append(await handle_cmd_download_redlines(cmd))
            elif cmd['cmd'] == 'download_redline_delays':
                resp.append(await handle_cmd_download_redline_delays(cmd))
            elif cmd['cmd'] == 'load_igniters':
                resp.append(await handle_cmd_load_igniters(cmd))
            elif cmd['cmd'] == 'download_igniters':
                resp.append(await handle_cmd_download_igniters(cmd))
            else:
                print(f"unsupported command \"{cmd['cmd']}\"")
        
        await ws.send(json.dumps(resp))

async def handle_cmd_set(cmd):
    print('set command')
    if not 'key' in cmd:
        print(f"ERROR: Wrong command structure: {cmd}")
        return 
    
    
    if cmd['key'] in input_configs:
        uaconfig = input_configs[cmd['key']]
        node = await uaclient.nodes.root.get_child(uaconfig['path'])

        # Check current state
        state_node = await uaclient.nodes.root.get_child("/Objects/1:observe/1:state")
        state = await state_node.read_value()

        # If we are in safe state
        if state == 3:
            # Switch to manual state before setting valves
            manual_node = await uaclient.nodes.root.get_child("/Objects/1:triggers/1:switch_to_manual_state")
            val = await manual_node.read_value()
            val = not val
            await manual_node.write_value(val)

            # Wait for switch to manual state (switching valves in safe state not allowed)
            retry_counter = 5
            while state != 1:
                await asyncio.sleep(0.005)
                state = await state_node.read_value()
                retry_counter -= 1
                if retry_counter <= 0:
                    print("ERROR: switch to manual state timed out in set command")
                    return

        if 'index' in uaconfig:
            print(f"setting {uaconfig['path']}[{uaconfig['index']}] to {cmd['value']}")
            val = await node.read_value()
            val[uaconfig['index']] = float(cmd['value']) # TODO: make datatype configurable
            await node.write_value(val)
        else:
            print(f"setting {uaconfig['path']} to {cmd['value']}")
            await node.write_value(cmd['value'])
    else:
        print(f"unsupported command input key \"{cmd['key']}\"")

## Sequence commands
async def handle_cmd_load_sequence(cmd):
    print('load_sequence command')
    if cmd['key'] in sequence_configs:
        sconfig = sequence_configs[cmd['key']]
        for step in cmd['sequence']:
            # Ensure outputs match between commanded and actual sequence
            config_keys = sconfig['outputs']
            step_keys = list(step['outputs'].keys())
            
            print(config_keys)
            print(step_keys)
            config_keys.sort()
            step_keys.sort()
            if step_keys != config_keys:
                print("ERROR: output mismatch between commanded and configured sequence")
                return

            # Ensure all durations are >0
            if float(step['time']) <= 0:
                print("ERROR: rejecting sequence with step duration < 0")
                return
        amount = sconfig['amount']
        
        paths = sconfig['opcua']
        seqIndex = sconfig['index']

        print(sconfig)

        if amount > 1:
            delay_path = paths['delay_vector_path']+str(seqIndex+1)    
        else:
            delay_path = paths['delay_vector_path']
        
        delay_node = await uaclient.nodes.root.get_child(delay_path)
        delay_arr = await delay_node.read_value()
    
        for stepIdx, step in enumerate(cmd['sequence']):
            duration = float(step['time'])

            if stepIdx != paths['amount'] - 1:
                delay_arr[stepIdx] = duration
            
            if amount > 1:
                # there are more than one sequence of the same type
                step_path = paths['sequence_step_path']+str(seqIndex+1)+paths['step_state_path']+str(seqIndex+1)+'_'+str(stepIdx+1) 
            else:
                # there is only one sequence of the type
                step_path = paths['sequence_step_path']+paths['step_state_path']+str(stepIdx+1) 
            

            step_node = await uaclient.nodes.root.get_child(step_path)
            step_arr = await step_node.read_value()

            hold_step_node = None
            hold_step_arr = None
            if 'sequence_hold_step_path' in paths and 'hold_step_state_path' in paths:
                if amount > 1:
                    # there are more than one sequence of the same type
                    hold_step_path = paths['sequence_hold_step_path']+str(seqIndex+1)+paths['hold_step_state_path']+str(seqIndex+1)+'_'+str(stepIdx+1)
                else:
                    # there is only one sequence of the type
                    hold_step_path = paths['sequence_hold_step_path']+paths['hold_step_state_path']+str(stepIdx+1) 

                hold_step_node = await uaclient.nodes.root.get_child(hold_step_path)
                hold_step_arr = await hold_step_node.read_value()

            for outKey, outVal in step['outputs'].items():
                if sconfig['key'] == 'redline_trigger_sequence':
                    outIdx = datapoints_dict[outKey]['opcua']['redlines']['index']
                else:
                    outIdx = datapoints_dict[outKey]['opcua']['index']

                if hold_step_arr is not None:
                    if outVal == 2:
                        step_arr[outIdx] = 0.0
                        hold_step_arr[outIdx] = 1.0
                    elif outVal == 1:
                        step_arr[outIdx] = 1.0
                        hold_step_arr[outIdx] = 0.0
                    elif outVal == 0:
                        step_arr[outIdx] = 0.0
                        hold_step_arr[outIdx] = 0.0
                    else:
                        print(f"ERROR: Value {outVal} given for valve {outKey} in sequence {sconfig['key']}")
                else:
                    if outVal == 1:
                        step_arr[outIdx] = 1.0
                    elif outVal == 0:
                        step_arr[outIdx] = 0.0
                    else:
                        print(f"ERROR: Value {outVal} given for valve {outKey} in sequence {sconfig['key']}")
            
            await step_node.write_value(step_arr)

            if hold_step_node is not None:
                await hold_step_node.write_value(hold_step_arr)
        
        lastIndex = len(cmd['sequence'])

        #fill out rest of delay vector and steps with 0
        for i in range(len(cmd["sequence"]),paths['amount']):
            
            if i < len(delay_arr):
                delay_arr[i] = 0.0

            if amount > 1:
                # there are more than one sequence of the same type
                step_path = paths['sequence_step_path']+str(seqIndex+1)+paths['step_state_path']+str(seqIndex+1)+'_'+str(i+1) 
            else:
                # there is only one sequence of the type
                step_path = paths['sequence_step_path']+paths['step_state_path']+str(i+1) 
            
            new_step_node = await uaclient.nodes.root.get_child(step_path)
            new_step_arr = await new_step_node.read_value()

            for j in range(len(new_step_arr)):
                if i == lastIndex:
                    new_step_arr[j] = step_arr[j]
                else:
                    new_step_arr[j] = 0.0

            await new_step_node.write_value(new_step_arr)

            
            new_hold_step_node = None
            new_hold_step_arr = None
            if 'sequence_hold_step_path' in paths and 'hold_step_state_path' in paths:
                if amount > 1:
                    # there are more than one sequence of the same type
                    hold_step_path = paths['sequence_hold_step_path']+str(seqIndex+1)+paths['hold_step_state_path']+str(seqIndex+1)+'_'+str(i+1)
                else:
                    # there is only one sequence of the type
                    hold_step_path = paths['sequence_hold_step_path']+paths['hold_step_state_path']+str(i+1) 

                new_hold_step_node = await uaclient.nodes.root.get_child(hold_step_path)
                new_hold_step_arr = await new_hold_step_node.read_value()
            
            
            if new_hold_step_arr is not None:
                for j in range(len(new_hold_step_arr)):
                    if i == lastIndex and hold_step_arr is not None:
                        new_hold_step_arr[j] = hold_step_arr[j]
                    else:
                        new_hold_step_arr[j] = 0.0
            
            
            if new_hold_step_node is not None:
                await new_hold_step_node.write_value(new_hold_step_arr)
            

        await delay_node.write_value(delay_arr)    
    else:
        print(f"invalid sequence key \"{cmd['key']}\"")

async def handle_cmd_download_sequence(cmd):
    print("download sequence command")

    if cmd['key'] in sequence_configs:
        sconfig = sequence_configs[cmd['key']]

        outKeys = sconfig['outputs']
        paths = sconfig['opcua']

        amount = sconfig['amount']
        seqIndex = sconfig['index']

        sequence_out = []

        if amount > 1:
            delay_path = paths['delay_vector_path']+str(seqIndex+1)    
        else:
            delay_path = paths['delay_vector_path']
        
        delay_node = await uaclient.nodes.root.get_child(delay_path)
        delay_arr = await delay_node.read_value()

        for stepIdx, delay in enumerate(delay_arr):
            if delay == 0 and stepIdx > 0:
                break

            step = {"time":delay,"outputs":{}}

            if amount > 1:
                # there are more than one sequence of the same type
                step_path = paths['sequence_step_path']+str(seqIndex+1)+paths['step_state_path']+str(seqIndex+1)+'_'+str(stepIdx+1)
            else:
                # there is only one sequence of the type
                step_path = paths['sequence_step_path']+paths['step_state_path']+str(stepIdx+1) 

            step_node = await uaclient.nodes.root.get_child(step_path)
            step_arr = await step_node.read_value()

            hold_step_arr = None
            if 'sequence_hold_step_path' in paths and 'hold_step_state_path' in paths:
                if amount > 1:
                    # there are more than one sequence of the same type
                    hold_step_path = paths['sequence_hold_step_path']+str(seqIndex+1)+paths['hold_step_state_path']+str(seqIndex+1)+'_'+str(stepIdx+1)
                else:
                    # there is only one sequence of the type
                    hold_step_path = paths['sequence_hold_step_path']+paths['hold_step_state_path']+str(stepIdx+1) 

                hold_step_node = await uaclient.nodes.root.get_child(hold_step_path)
                hold_step_arr = await hold_step_node.read_value()

            for outKey in outKeys:
                if sconfig['key'] == 'redline_trigger_sequence':
                    outIdx = datapoints_dict[outKey]['opcua']['redlines']['index']
                else:
                    outIdx = datapoints_dict[outKey]['opcua']['index']

                keyVal = step_arr[outIdx]

                step['outputs'][outKey] = keyVal

                if hold_step_arr is not None:
                    if hold_step_arr[outIdx] == 1 and keyVal == 0:
                        step['outputs'][outKey] = 2

            sequence_out.append(step)

        msg = {
            "type": cmd['cmd'] + "_response",
            "sequence_type": sconfig['type'],
            "sequence": sequence_out,
        }

        return msg 

async def handle_cmd_start_sequence(cmd):
    if cmd['key'] in sequence_configs:
        sconfig = sequence_configs[cmd['key']]

        if 'opcua' not in sconfig or 'trigger_path' not in sconfig['opcua']:
            print("ERROR: missing opcua/trigger_path attribute in sequence config")
            return

        # Toggle the trigger node to trigger the sequence
        trigger_path = sconfig['opcua']['trigger_path']
        trigger_node = await uaclient.nodes.root.get_child(trigger_path)
        trigger_val = await trigger_node.read_value()
        trigger_val = not trigger_val
        await trigger_node.write_value(trigger_val)
## End sequence commands

## Calibration commands
async def handle_cmd_load_calibs(cmd):
    print('load_calibs command')

    if cmd['calibs'] is None:
        print(f"Invalid calibration command \"{cmd}\"")
        return
    for calib in cmd['calibs']: 
        if 'key' in calib and 'offset' in calib and 'slope' in calib:
            key = calib['key']
            offset = calib['offset']
            slope = calib['slope']
            try:
                offset = float(offset)
                slope = float(slope)
            except ValueError:
                print(f"Invalid calibration values for sensor \"{key}\"")
                return
            
            if slope == 0:
                print(f"Invalid calibration values for sensor \"{key}\": slope must not be 0")
                return
            
            # Update datasource
            found = False
            if datasource["Calibrations"] is not None:
                calib_data = datasource["Calibrations"]
                for sensor in calib_data:
                    if sensor["key"] == key:
                        found = True
                        sensor["offset"] = offset
                        sensor["slope"] = slope
                        break
                if not found: 
                    print(f"Sensor \"{key}\" does not have calibration")  
                    continue
            
            # Send to MCS
            if key in datapoints_dict:
                paths = datapoints_dict[key]['opcua']
                offset_node = await uaclient.nodes.root.get_child(paths['offset_path'])
                offset_arr = await offset_node.read_value()
                offset_arr[paths['index']] = offset
                slope_node = await uaclient.nodes.root.get_child(paths['slope_path'])
                slope_arr = await slope_node.read_value()
                slope_arr[paths['index']] = slope

                await offset_node.write_value(offset_arr)
                await slope_node.write_value(slope_arr)
                
            else:
                print(f"Sensor \"{key}\" does not exist")  
        else:
            print(f"Invalid calibration command \"{cmd}\"")
            return
        
    # Save to config file
    f = open(EQFILEMOUNTPT, "w")
    f.write(json.dumps(datasource))

async def handle_cmd_download_calibs(cmd):
    print('download_calibs command')

    calibs = []
    for calib in datasource["Calibrations"]:
        key = calib['key']
        if key in datapoints_dict:
            sensor = datapoints_dict[key]
            if 'opcua' in sensor and 'offset_path' in sensor['opcua'] and 'slope_path' in sensor['opcua']:
                paths = sensor['opcua']
                offset_node = await uaclient.nodes.root.get_child(paths['offset_path'])
                slope_node = await uaclient.nodes.root.get_child(paths['slope_path'])
                offset = await offset_node.read_value()
                slope = await slope_node.read_value()
                if not (offset[paths['index']] == 0 and slope[paths['index']] == 1):
                    calibs.append({"key": key, "offset": offset[paths['index']], "slope": slope[paths['index']]})
            else:
                print(f"Sensor \"{key}\" does not have calibration configuration")
    msg = {
        "type": cmd['cmd'] + "_response",
        "calibs": calibs
    }

    return msg
    
## End calibration commands




## Start redline commands
redlineBigNumberDefaultValue = 1000000.0

async def handle_cmd_load_redlines(cmd):
    print('load_redlines command')

    if cmd['redlines'] is None:
        print(f"Invalid redlines command \"{cmd}\"")
        return
    
    sent_redlines = {}
    for redline in cmd['redlines']:
        sent_redlines[redline['key']] = redline

    #TODO: check if some redline is sent that is not in config
    
    
    for configRedline in datasource["Redlines"]:
    # loop over all redline sensors from config

        if configRedline['key'] in sent_redlines: 
        # found a redline in the received data, saving that data to write to MCS

            redline = sent_redlines[configRedline['key']]
            
            if 'key' in redline and 'upper' in redline and 'lower' in redline and 'timeout' in redline:
                key = redline['key']
                lower = redline['lower']
                upper = redline['upper']
                timeout = redline['timeout']
                try:
                    lower = float(lower)
                    upper = float(upper)
                    timeout = float(timeout)
                except ValueError:
                    print(f"Invalid redline values for sensor \"{key}\"")
                    return
                
                # TODO: check for invalid values maybe?
                
                redline['lower'] = lower
                redline['upper'] = upper
                redline['timeout'] = timeout 
               
        else:
        # no redline sent with that key, write default values
            redline = {}
            key = configRedline['key']
            lower = -redlineBigNumberDefaultValue
            upper = redlineBigNumberDefaultValue
            timeout = 0.0

            redline['key'] = key
            redline['lower'] = lower
            redline['upper'] = upper
            redline['timeout'] = timeout 
                    
           
        # Update datasource
        configRedline['key'] = redline['key']   
        configRedline['lower'] = redline['lower']     
        configRedline['upper'] = redline['upper']              
        configRedline['timeout'] = redline['timeout']  

        print(redline)

        # Send to MCS
        if key in datapoints_dict:
            redline_paths = datapoints_dict[key]['opcua']['redlines']

            lower_node = await uaclient.nodes.root.get_child(redline_paths['lower_limit_path'])
            lower_arr = await lower_node.read_value()
            lower_arr[redline_paths['index']] = redline['lower']

            upper_node = await uaclient.nodes.root.get_child(redline_paths['upper_limit_path'])
            upper_arr = await upper_node.read_value()
            upper_arr[redline_paths['index']] = redline['upper']

            timeout_node = await uaclient.nodes.root.get_child(redline_paths['signal_duration'])
            timeout_arr = await timeout_node.read_value()
            timeout_arr[redline_paths['index']] =  redline['timeout'] 

            await lower_node.write_value(lower_arr)
            await upper_node.write_value(upper_arr)
            await timeout_node.write_value(timeout_arr)
        else:
            print(f"Sensor \"{key}\" does not exist")          
            
async def handle_cmd_load_redline_delays(cmd):
    print("load_redline_delays command")
    redlineSeq = next((x for x in datasource['Sequences'] if x['type'] == "redline"), None)
    if redlineSeq is None:
        return

    amount = redlineSeq['amount']

    if len(cmd['delays']) >= amount:
        print("ERROR: too many delay values")
        return

    delay_between_seq_path = redlineSeq['opcua']['delay_between_seq_path']
    
    delay_node = await uaclient.nodes.root.get_child(delay_between_seq_path)
    delay_arr = await delay_node.read_value()
    
    for index,value in enumerate(cmd['delays']):
        try:
            value = float(value)
        except ValueError:
                print(f"Invalid redline delay values at index \"{index}\"")
                return
        
        delay_arr[index] = value
    
    await delay_node.write_value(delay_arr)

async def handle_cmd_download_redlines(cmd):
    print('download_redlines command')

    redlines = []

    for redlineConf in datasource['Redlines']: 
        key = redlineConf['key']
        redline = {}
            
        # Get from MCS
        if key in datapoints_dict:
            redline_paths = datapoints_dict[key]['opcua']['redlines']
            lower_node = await uaclient.nodes.root.get_child(redline_paths['lower_limit_path'])
            lower_arr = await lower_node.read_value()
            lower = lower_arr[redline_paths['index']]

            upper_node = await uaclient.nodes.root.get_child(redline_paths['upper_limit_path'])
            upper_arr = await upper_node.read_value()
            upper = upper_arr[redline_paths['index']]

            timeout_node = await uaclient.nodes.root.get_child(redline_paths['signal_duration'])
            timeout_arr = await timeout_node.read_value()
            timeout = timeout_arr[redline_paths['index']]

            print(lower,upper,timeout) 
        
            if not (lower == -redlineBigNumberDefaultValue and upper == redlineBigNumberDefaultValue and timeout == 0):
                redline['key'] = key
                redline['lower'] = lower
                redline['upper'] = upper
                redline['timeout'] = timeout
                
                redlines.append(redline)
        else:
            print(f"WARN: datapoint for key {key} not found")
    msg = {
        "type": cmd['cmd'] + "_response",
        "redlines": redlines
    }

    return msg

async def handle_cmd_download_redline_delays(cmd):
    print("download_redline_delays command")
    redlineSeq = next((x for x in datasource['Sequences'] if x['type'] == "redline"), None)
    if redlineSeq is None:
        return

    delay_between_seq_path = redlineSeq['opcua']['delay_between_seq_path']
    
    delay_node = await uaclient.nodes.root.get_child(delay_between_seq_path)
    delay_arr = await delay_node.read_value()

    for i in range(len(delay_arr)):
        delay_arr[i] = delay_arr[i]

    msg = {
        "type": cmd['cmd'] + "_response",
        "delays": delay_arr
    }

    return msg

## End redlines commands

## Igniter commands

async def handle_cmd_load_igniters(cmd):
    print('load_igniters command')

    if cmd['igniters'] is None and len(cmd['igniters']) != 2:
        print(f"Invalid igniters command \"{cmd}\"")
        return
    
    enabled_path = ""
    enabled_arr = []
    for i, igniter in enumerate(datasource["Igniters"]):
        #TODO in loop, write igniter values to config
        
        if igniter['opcua']['enabled_path'] is not None and igniter['opcua']['delay_path'] is not None:
            enabled_path = igniter['opcua']['enabled_path']
            delay_path = igniter['opcua']['delay_path']
        else:
            print("Igniter path(s) not found in config")
            return
        if (cmd["igniters"][i]["enabled"] is not None and cmd["igniters"][i]["delay"] is not None and cmd["igniters"][i]["duration"] is not None):
            enabled = cmd["igniters"][i]["enabled"]
            delay = cmd["igniters"][i]["delay"]
            duration = cmd["igniters"][i]["duration"]
            try:
                enabled = bool(enabled)
                delay = float(delay)
                duration = float(duration)
    
                if delay < 0 or duration < 0:
                    print(f"Invalid igniter values for igniter \"{i + 1}\"")
                    return
                
            except ValueError:
                print(f"Invalid igniter values for igniter \"{i + 1}\"")
                return
            
            # Update datasource (in seconds)
            igniter['enabled'] = 1.0 if enabled else 0.0
            igniter['delay'] = delay
            igniter['duration'] = duration
            
            # Write enabled value to array
            enabled_arr.append(1.0 if enabled else 0.0)

            # Send delay and duration to MCS
            print(delay_path)

            delay_duration_node = await uaclient.nodes.root.get_child(delay_path)
            await delay_duration_node.write_value([delay, duration])
        else:
            print(f"Invalid igniter values for igniter \"{i + 1}\"")
            return
        
    # Send enabled to MCS
    if enabled_path != "":
        enabled_node = await uaclient.nodes.root.get_child(enabled_path)
        await enabled_node.write_value(enabled_arr)
    else:
        print("Invalid igniter path(s) in config")
        return
    
    
async def handle_cmd_download_igniters(cmd):

    print('download_igniters command')

    igniters = []
    enabled_path = ""

    for igniter in datasource["Igniters"]:
        enabled_path = igniter['opcua']['enabled_path']
        delay_path = igniter['opcua']['delay_path']
        delay_duration_node = await uaclient.nodes.root.get_child(delay_path)
        delay_duration = await delay_duration_node.read_value()
        igniters.append({
            "key": igniter['key'],
            "name": igniter['name'],
            "delay": delay_duration[0],
            "duration": delay_duration[1]
        })
          
    # Add enabled values to igniter list
    if enabled_path != "":
        enabled_node = await uaclient.nodes.root.get_child(enabled_path)
        enabled_list = map(lambda x: bool(x), await enabled_node.read_value())
        for i, enabled in enumerate(enabled_list):
            igniters[i]["enabled"] = enabled       
    else:
        print("Invalid igniter path(s) in config")
        return
    
    msg = {
        "type": cmd['cmd'] + "_response",
        "igniters": igniters
    }

    return msg

async def websocket_handler(ws):
    global ws_connections

    print(f'WS: Connected')
    ws_connections.add(ws)
    try:
        while True:
            # 4 s timeout, client sends keepalive every 0.5 s
            async with asyncio.timeout(4):
                msg = await ws.recv()
                if 'commands' in msg:
                    cmd = json.loads(msg)
                    print(f'cmd: {cmd}')
                    cmd_queue.put_nowait((ws, cmd))
    except websockets.exceptions.ConnectionClosed:
        print('Websocket: Connection closed')
    except TimeoutError:
        print('Websocket: Connection timed out')
    finally:
        print('Websocket: Removing connection')
        ws_connections.remove(ws)

async def websocket_task():
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_cert = "/cert"
    ssl_key = "/key"
    ssl_context.load_cert_chain(ssl_cert, keyfile=ssl_key)

    async with websockets.serve(websocket_handler, "0.0.0.0", 9100, ssl=ssl_context):
        while True:
            keepalive = {
                'type': 'Keepalive',
                'data': {
                    'utc': int(time.time_ns()/1000),
                    'value': 'keepAlive',
                    'key': 'keepAlive'
                }
            }
            websockets.broadcast(ws_connections, json.dumps(keepalive))

            await asyncio.sleep(0.2)

async def publish_to_redis_task():
    global r
    global node_datapoints
    global redis_queue

    r = redis.Redis(host='redis', port=6379, decode_responses=True)

    while True:
        (redis_key, redis_value) = await redis_queue.get()
        await r.xadd(redis_key, redis_value)

async def dummy_task():
    '''
    Generate dummy data and send to redis queue
    '''
    global redis_queue
    global datapoint_timer
    global datapoint_counter
    global datasource

    # wait for config
    while datasource == {}:
        await asyncio.sleep(1)

    cur_val = 0
    while True:
        redis_key = f"{datasource}:DATA"
        redis_value = { }

        for i in range(1, 17):
            datakey = f"TC{i}"
            redis_value[datakey] = cur_val

        for i in range(1, 17):
            datakey = f"S{i}"
            redis_value[datakey] = cur_val

        cur_val = cur_val + 0.5
        if cur_val > 100:
            cur_val = 0

        redis_queue.put_nowait((redis_key, redis_value))
        print(f"data: {(redis_key, redis_value)}")

        datapoint_counter = datapoint_counter + 1
        if time.time() - datapoint_timer >= 1:
            print(f"{time.time()} STAT {datapoint_counter} pps")
            datapoint_counter = 0
            datapoint_timer = time.time()
        await asyncio.sleep(0.1)

async def main():
    async with asyncio.TaskGroup() as tg:
        await parse_eq_config()

        tg.create_task(opcua_task())
        #tg.create_task(dummy_task())
        tg.create_task(publish_to_redis_task())
        tg.create_task(websocket_task())
        tg.create_task(command_task())

if __name__ == "__main__":
    asyncio.run(main())
