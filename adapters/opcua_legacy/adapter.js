// TODO: Update this adapter to resemble approach used in tcp adapter:
// - Single OPC UA data source
// - always publish on 9000
// Also:
// TODO: Update the way OPC UA object tree is shared. Using additional
// port 9999 for this is hacky workaround. Start.py could handle this
// and update eqconfig statically before it is shared to all adapters

var argv = require('minimist')(process.argv.slice(2))
const WebSocketServer = require('ws').Server;
const fs = require('fs');
const path = require('path');
const https = require('https');

//OPC UA imports and definitions
const nodeopcua = require('node-opcua');
const { log } = require('console');
const OPCUAClient = nodeopcua.OPCUAClient;
const MessageSecurityMode = nodeopcua.MessageSecurityMode;
const SecurityPolicy = nodeopcua.SecurityPolicy;
const AttributeIds = nodeopcua.AttributeIds;
const makeBrowsePath = nodeopcua.makeBrowsePath;
const ClientSubscription = nodeopcua.ClientSubscription;
const TimestampsToReturn = nodeopcua.TimestampsToReturn;
const MonitoringParametersOptions = nodeopcua.MonitoringParametersOptions;
const ReadValueIdLike = nodeopcua.ReadValueIdLike;
const ClientMonitoredItem = nodeopcua.ClientMonitoredItem;
const DataValue = nodeopcua.DataValue;

// ENVIRONMENT
try{
    const CERTFILEMOUNT = '/cert'
    const KEYFILEMOUNT = '/key'
    EQFILEMOUNTPT = '/eqconfig';
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
}catch(err){
    const CERTFILEMOUNT = path.resolve('../../certs/exui.de/fullchain.pem')
    const KEYFILEMOUNT = path.resolve('../../certs/exui.de/privkey.pem')
    EQFILEMOUNTPT = path.resolve('../../privat_eqconfig/eqconfig.json');
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
    console.log("cant open keyfile")
}
// The equipment configuration is mounted into the adapters'
// docker container by docker swarm using the "configs" property
// in docker-compose.yml
const TASKSLOT = argv._[0];
//The task slot identifies the replica number of this adapter.
//If the task slot is 1, the adapter is supposed to ONLY handle
//the first tcp source in the eqconfig. This way, adapters can be
//scaled and distributed with number of data sources
const DESTPORT = 9000
// The destination port is identical for every adapter, because it
// is automatically mapped to an unused port in range specified in
// docker-compose.yml

var EQCONFIG = {};
var SRC = {}

// GLOBAL VARS
var eqconfig = {};
var client = {};
var session = {};
var destSocket;
var datapoints = [];

var browseSocket = new WebSocketServer({    port: 9999, 
                                            host: "0.0.0.0",
                                            clientTracking: true });

var subscriptionparams =    {
                                requestedPublishingInterval: 100, //Currently less than 100 is blocked somewhere
                                requestedLifetimeCount:      1500,
                                requestedMaxKeepAliveCount:   20,
                                maxNotificationsPerPublish:  0,
                                publishingEnabled: true,
                                priority: 10
                            }

// FUNCTIONS

function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function setupDestServers()
{
    if (EQCONFIG.DNS.useHTTPS == "True") {
        const server = https.createServer({key: key, cert: cert });

        destSocket = new WebSocketServer({server})
        server.listen(DESTPORT)
    }else{
    destSocket = new WebSocketServer({  port: DESTPORT, 
                                        host: "0.0.0.0",
                                        clientTracking: true });
    }

    /*srcSocket = new Net.Socket();
    srcSocket.setEncoding("UTF-8");
    timeoutstate = false;  //xx*/

}

function defineDestEvents()
{

    //WebSocket Server Listening Event
    destSocket.on('listening', () => {
        console.log("[" + SRC.name + "]\t" + "WebSocket Server is listening.");
    });
    
    //WebSocket Server Connection Event
    destSocket.on('connection', (ws, req) => {
        
        //Event: Connection established
        console.log("[" + SRC.name + "]\t" + "Successful Client Connection from: " + 
                req.socket.remoteAddress);
        //Event: Client sends message
        ws.on('message', data => {
            // if(data == '_BROWSE_\n') {
            //     // Possibly wait
            //     browseSocket.send(JSON.stringify(datapoints));
            // }
            // else {
                console.log("[" + SRC.name + "]\t" + "<- Sending Command: " + data);
                //send actual command or set variable XX
            //}
        });
        //Event: Client closes connection
        ws.on('close', () => {
            console.log("[" + SRC.name + "]\t" + "Connection with client at " + 
                ws._socket.remoteAddress + " closed.");
        })
        //Event: Some error with client
        ws.on('error', () => {
            console.log("[" + SRC.name + "]\t" + "Error communicating with Client at" + 
                ws._socket.remoteAddress);
        })
    });
    
    // WebSocket Server close event
    destSocket.on('close', () => {
        console.log("[" + SRC.name + "]\t" + "Websocket Server closed.")
    })
        
      
        
}

function setupSourceClients()
{
    const connectionStrategy = {
        initialDelay: SRC.timeout
    }
    
    const options = {
        applicationName: SRC.key + "_Client",
        connectionStrategy: connectionStrategy,
        securityMode: nodeopcua.MessageSecurityMode.None,
        securityPolicy: nodeopcua.SecurityPolicy.None,
        endpointMustExist: false,
    };
    
    client = OPCUAClient.create(options);
    console.log("Creating Client");

    defineSourceEvents();
}

function defineSourceEvents()
{
    
    //Reconnection try event
    client.on("start_reconnection", function() {
        console.log("[" + SRC.name + "]\t" + "Trying to reconnect...")
        });

    // Backoff Event
    client.on("backoff", function(nb, delay) {
        console.log("[" + SRC.name + "]\t" + "  connection failed for the", nb,
            " time. Retry in ", delay, " ms");
    });


}

async function connectToSources()
{
       
    try {
        // step 1 : connect to
        await client.connect(SRC.ip);
        console.log("[" + SRC.name + "]\t" + "Connected.");

        // step 2 : Create session
        session = await client.createSession();
        console.log("[" + SRC.name + "]\t" + "Session created.");




    } catch(err) {
        console.log("[" + SRC.name + "]\t" + "Connection Error: ", err);
    }

}

async function parseEqConfig() 
{
    // Get equipment configuration file from file system
    // It has previously been mounted into the docker container by the "configs"
    // property in the docker-compose.yml
    let eqfile = fs.readFileSync(EQFILEMOUNTPT);
    EQCONFIG = JSON.parse(eqfile);
    // console.log(eqconfig)

    let opcuacounter = 0
    EQCONFIG.datasources.forEach( (source, i) => {
        if(source.type == "OPCUA" || source.type == "opcua") {
            opcuacounter += 1;
            if(opcuacounter == TASKSLOT) { //i.e. Only handle first tcp source if TASKSLOT=1
                SRC = source;
            }
        }
    });
}




function setupSubscriptions()
{

    
    const subscription = ClientSubscription.create(session, subscriptionparams);
    // EVENT DIEFINITIONS
    //Start Event
    subscription.on("started", function() {
        console.log("[" + SRC.name + "]\t" + "Subscribed with ID ", subscription.subscriptionId);
    })

    //Termination Event
    subscription.on("terminated", function() {
        console.log("[" + SRC.name + "]\t" + "Subscription " + subscription.subscriptionId + " terminated.");
    })
    
    //Keep Alive Event (Server cannot supply data, but wants to keep suscription alive)
    subscription.on("keepalive", function() {
        console.log("[" + SRC.name + "]\t" + "\"Keep Alive\" signal received.");
    })

    //Error Event
    subscription.on("error", function() {
        console.log("[" + SRC.name + "]\t" + "Error in subscription with ID " + subscription.subscriptionId);
    })

    //ADD SUBSCRIPTION FOR EACH DATA POINT
    SRC.datapoints.forEach(point => {
        var keys = []
        keys = keys.concat(recurse_fetch_Datapoints(point))
        keys.forEach(key =>{
            const itemToMonitor = {
                nodeId: "ns=1;s=" + key,
                attributeId: AttributeIds.Value
            }
            //console.log("Creating itemMonitor for:",itemToMonitor);
            const itemParams = {
                samplingInterval: 33,
                discardOldest: true,
                queueSize: 1
            }
            const monitoredItem  = ClientMonitoredItem.create(
                    subscription,
                    itemToMonitor,
                    itemParams,
                    TimestampsToReturn.Both
            );

            var regex = /[+-]?\d+(\.\d+)?/g;
            monitoredItem.on("changed", (dataValue) => {
                //console.log(dataValue.value.toString().match(regex).map(function(v) { return parseFloat(v); })[0]);
                packet = {
                    value: dataValue.value.toString().match(regex).map(function(v) { return parseFloat(v); })[0],
                    utc: Date.now(), //Use sourceTimeStamp in Future
                    key: SRC.key+"."+key
                }
                destSocket.clients.forEach(client => {
                    client.send(JSON.stringify(packet));
                })
                // console.log(dataValue.toString());
            });
        })
    })
    
}

function recurse_fetch_Datapoints(datapoint){
    var pointKeys = []
    if (datapoint.type != "folder"){
        return datapoint.key.split(".")[1]
    }else{
        datapoint.values.forEach(value =>{
            pointKeys = pointKeys.concat(recurse_fetch_Datapoints(value))
        })
        return pointKeys
    }

}


async function main()
{
    await parseEqConfig();
    await setupSourceClients();
    await connectToSources();
    console.log("START DEST SERVER");
    await setupDestServers();
    await defineDestEvents();
    await setupSubscriptions();

}

main();