
const fs = require('fs');
const WebSocketServer = require('ws').Server;
const https = require('https');
var argv = require('minimist')(process.argv.slice(2))
const udp = require('dgram');
const path = require('path');

// ENVIRONMENT



var key;
var cert;
var EQFILEMOUNTPT

try{
    const CERTFILEMOUNT = '/cert'
    const KEYFILEMOUNT = '/key'
    EQFILEMOUNTPT = '/eqconfig';
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
}catch{
    const CERTFILEMOUNT = path.resolve('../../certs/exui.de/fullchain.pem')
    const KEYFILEMOUNT = path.resolve('../../certs/exui.de/privkey.pem')
    EQFILEMOUNTPT = path.resolve('../../privat_eqconfig/Controlls_test.json');
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


var eqconfig = {};
var SRC = {};

var timeout = {};
var sourceSocket = {};
var destSocket = {};


function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}




function parseEqConfig() 
{
    // Get equipment configuration file from file system
    // It has previously been mounted into the docker container by the "configs"
    // property in the docker-compose.yml
    
    let eqfile = fs.readFileSync(EQFILEMOUNTPT);
    eqconfig = JSON.parse(eqfile);
    // console.log(eqconfig)

    let udp_aprs_counter = 0
    eqconfig.datasources.forEach( (source, i) => {
        if(source.type == "APRS" || source.type == "aprs" ) {
            udp_aprs_counter += 1;
            if(udp_aprs_counter == TASKSLOT) { //i.e. Only handle first tcp source if TASKSLOT=1
                SRC = source;
                console.log(SRC);
            }
        }
    });
}     

async function connectToSources()
{
    sourceSocket.bind(SRC.sourceport)
    console.log(SRC.ip);
    console.log(SRC.sourceport);

}

async function setupSockets()
{  
    if (eqconfig.DNS.useHTTPS == "True") {
        const server = https.createServer({key: key, cert: cert });

        destSocket = new WebSocketServer({server})
        server.listen(DESTPORT)
    }else{
    destSocket = new WebSocketServer({  port: DESTPORT, 
                                        host: "0.0.0.0",
                                        clientTracking: true });
    }
                                        

    sourceSocket = new udp.createSocket('udp4');
    timeoutstates = false;  
}


function defineEvents()
{
    delimiter = SRC.delimiter;


            
    //If an error on connection to data source occurs, try to reconnect periodically
    sourceSocket.on('error', async(error) => {
        console.log("[" + SRC.name + "]\t" + "Connection to " + SRC.name + 
            " failed. Reason: \"" + error + "\" Trying to reconnect in 1s")
        //Let ex-ui client know about error:
        destSocket.clients.forEach(client => {
            client.send(JSON.stringify({
                key: '_CONN_',
                utc: Date.now(),
                value: 'Error'+error
            }));
        })
        await sleep(1000)
        // Reconnection interval will not be 1s but conn. establishment time + 1s
        connectToSources();
    });
    
    sourceSocket.on('ready', () => {
        console.log("[" + SRC.name + "]\t" + "Connected.");

        //Let ex-ui client know about successful connection:
        destSocket.clients.forEach(client => {
            client.send(JSON.stringify({
                key: '_CONN_',
                utc: Date.now(),
                value: 'Good'
            }));
        })
    });

    // Handler for incoming UDP data from source
    sourceSocket.on('message', data => {
        console.log("[" + SRC.name + "]\t" + "Received Data.");
   

        //Parse incoming Data
        console.log(data);
        console.log(decodeURIComponent(data));
        data = decodeURIComponent(data);
        str_data = data.toString();
        split_line = str_data.split(delimiter);
        console.log("REcived Data are: "+data);
        let value = 0
        let packet = {}

        for( i in split_line){ 
            if ( split_line[i] === '') { 
                console.log("here");
                split_line.splice(i, 1); 
            }
        }

        console.log(split_line);

        if (SRC.datapoints.length <= split_line.length){
            for(i in SRC.datapoints ){
                console.log(SRC.datapoints[i].values[0].format);
                switch (SRC.datapoints[i].values[0].format) {
                    case "float":
                        value = parseFloat(split_line[i]);
                        break;
                    case "integer":
                        value = parseInt(split_line[i]);
                        break; 
                    default:
                        value = split_line[i]
                        break;
                }
                packet = {
                    value: value,
                    utc: Date.now(),
                    key: SRC.datapoints[i].key
                };
                console.log("Sending Packet to clients:");
                console.log(packet);
                console.log("_________________");
                destSocket.clients.forEach(client => {
                    client.send(JSON.stringify(packet));
                })
            }
        }else{
            console.log("Error recived data has not enought patapoints")
        }

    });    
            //WebSocket Server Listening Event
            destSocket.on('listening', () => {
                console.log("[" + SRC.name + "]\t" + "WebSocket Server is listening.");
            });

            
            //WebSocket Server Connection Event
            destSocket.on('connection', (ws, req) => {
                console.log('Device connected');
                
                //Event: Connection established
                console.log("[" + SRC.name + "]\t" + "Successful Client Connection from: " + 
                        req.socket.remoteAddress);
                //Event: Client sends message
                ws.on('message', data => {
                    console.log("[" + SRC.name + "]\t" + "<- Sending Command: " + data);
                    packet = {
                        value: "Wellcome",
                        utc: Date.now(),
                        key: 'test'
                    };
                    destSocket.clients.forEach(client => {
                        client.send(JSON.stringify(packet));
                    })
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
            
            destSocket.on('close', () => {
                console.log("[" + SRC.name + "]\t" + "Websocket Server closed.")
            });

            setInterval(() => {
                destSocket.clients.forEach(client=>{
                    client.send(JSON.stringify({
                        value: "KeepAlive",
                        utc: Date.now(),
                        key: "KeepAlive"
                    }))
                })
            }, 1000);
}


async function main()
{
    await parseEqConfig();
    await setupSockets();
    // src = {} means connect to all sources
    await defineEvents();
    await connectToSources();
}

main();