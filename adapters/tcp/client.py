import asyncio
import json
import time
import ssl
import parse
import websockets

EQFILEMOUNTPT = '/eqconfig'

tcp_ip = ''
tcp_port = 0

ws_connections = set()
cmd_queue = asyncio.Queue(maxsize=128)

tcp_out_queue = asyncio.Queue(maxsize=128)


async def parse_eq_config():
    global datasource
    global tcp_ip
    global tcp_port
    global inputs
    global datapoints

    f = open(EQFILEMOUNTPT)
    data = json.load(f)

    datasources = data['datasources']

    # TODO: Support multiple sources
    for source in filter(lambda s: s['type'] == "tcp", datasources):
        datasource = source
        break

    if datasource == {}:
        print('ERROR: no datasource found')

    tcp_ip = datasource['Source']['ip']
    tcp_port = datasource['Source']['port']

    inputs_arr = datasource['Controlls']['Inputs']
    inputs = {}
    for inp in inputs_arr:
        inputs[inp['key']] = inp

    datapoints = {}
    get_datapoints_recurcive(datasource['datapoints'], datapoints)


def get_datapoints_recurcive(datapoints_arr, configs):
    for i in datapoints_arr:
        if 'type' in i and i['type'] == 'folder' and 'values' in i:
            get_datapoints_recurcive(i['values'], configs)
        elif 'key' in i:
            configs[i['key']] = i



async def parse_tcp_msg(msg):
    for key, dp in datapoints.items():
        print(dp)
        parsedRes = parse.search(
            dp['tcp']['parsestring'], msg, case_sensitive=True)
        if parsedRes is not None and parsedRes[0] is not None:
            dp['value'] = parsedRes[0]
            print(dp)
            return


async def command_task():
    while True:
        (ws, msg) = await cmd_queue.get()

        resp = []

        for cmd in msg['commands']:
            if cmd['cmd'] == 'set':
                await handle_cmd_set(cmd)
            elif cmd['cmd'] == 'get':
                resp.append(await handle_cmd_get(cmd))
            else:
                print(f"unsupported command \"{cmd['cmd']}\"")

        await ws.send(json.dumps(resp))


async def handle_cmd_set(cmd):
    global enabled_folder

    curr_in = cmd['input']

    if 'key' in curr_in and inputs[curr_in['key']]:
        real_input = inputs[curr_in['key']]
    else:
        print(f"ERROR: input for {curr_in} does not exist in config")
        return

    keys = real_input['tcp']['keys']
    values = []
    if 'tcp' in curr_in and 'values' in curr_in['tcp']:
        for key in keys:
            if key not in curr_in['tcp']['values']:
                print(f"ERROR: should specify value for {key}")
                return
            values.append(curr_in['tcp']['values'][key])
    else:
        print(f"ERROR: No values given in input {curr_in}")
        return

    data = real_input['tcp']['parsestring'].format(*values)

    print(data)

    await tcp_out_queue.put(data.encode())

async def handle_cmd_get(cmd):
    data = cmd['data']

    if not 'key' in data:
        print("ERROR: Key missing from request")
        return {}

    msg = {
        "type": cmd['cmd'] + "_response",
        "data": datapoints[data['key']],
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
            await asyncio.sleep(1)

async def serial_init():
    reader, writer = await asyncio.open_connection(tcp_ip, tcp_port)
    return (reader, writer)

async def serial_read_task(reader):
    while True:
        msg = await reader.readuntil(b'\n')
        print(f"SER< {msg}")

        await parse_tcp_msg(msg.decode('ascii'))

async def serial_write_task(writer):
    while True:
        cmd = await tcp_out_queue.get()
        print(f"SER> {cmd}")

        writer.write(cmd)

async def main():
    async with asyncio.TaskGroup() as tg:
        await parse_eq_config()
        (reader, writer) = await serial_init()

        tg.create_task(serial_read_task(reader))
        tg.create_task(serial_write_task(writer))
        tg.create_task(websocket_task())
        tg.create_task(command_task())

if __name__ == "__main__":
    asyncio.run(main())
