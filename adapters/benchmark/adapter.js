var argv = require('minimist')(process.argv.slice(2));
const WebSocketServer = require('ws').Server;
const https = require('https');
const Math = require('mathjs');
const path = require('path');
const fs = require('fs');


// ENVIRONMENT
const EQFILEMOUNTPT = '/eqconfig';
const CERTFILEMOUNT = '/cert'
const KEYFILEMOUNT = '/key'

var key;
var cert;
try{
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
}catch{
    console.log("cant open keyfile")
}
//const EQFILEMOUNTPT = path.resolve('../../privat_eqconfig/eqconfig.json');
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
var SRC = {};


// GLOBAL VARS
var destSocket = {};


// FUNCTIONS
function parseEqConfig() 
{
    // Get equipment configuration file from file system
    // It has previously been mounted into the docker container by the "configs"
    // property in the docker-compose.yml
    
    let eqfile = fs.readFileSync(EQFILEMOUNTPT);
    EQCONFIG = JSON.parse(eqfile);
    // console.log(eqconfig)

    let bmcounter = 0
    EQCONFIG.datasources.forEach( (source, i) => {
        if(source.type == "benchmark" || source.type == "Benchmark" || source.type == "BENCHMARK") {
            bmcounter += 1;
            if(bmcounter == TASKSLOT) { //i.e. Only handle first tcp source if TASKSLOT=1
                SRC = source;
            }
        }
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
    defineDestEvents();
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

        //Set up benchmark
        let time = Date.now()
        let timestamp = 0;
        let key = SRC.datapoints[0].key
        setInterval( () => {
            time = time + SRC.sampleinterval
            let packet = {
                value: TASKSLOT * Math.sin(0.125 * timestamp),
                utc: time,
                key: key
            }
            ws.send(JSON.stringify(packet));
            timestamp = timestamp + SRC.sampleinterval;
        }, SRC.sampleinterval);

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

async function main()
{
    parseEqConfig();
    setupDestServers();
}


// ### SOFT SHUTDOWN ### //
process.on('SIGTERM', () => {
    console.log("Soft shutdown requested, bye...")
    // Soft close
    destSocket.clients.forEach((socket) => {
        socket.close();
    })
    // If a socket somehow stayed open after 5s, close it
    setTimeout(() => {
        destSocket.clients.forEach((socket) => {
          if ([socket.OPEN, socket.CLOSING].includes(socket.readyState)) {
            socket.terminate();
          }
        });
        process.exit(0)
      }, 5000);
})

main();