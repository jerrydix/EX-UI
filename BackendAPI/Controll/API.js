var argv = require('minimist')(process.argv.slice(2))
const https = require('https');
const WebSocketServer = require('ws').Server
const fs = require('fs');
const path = require('path');
const { clearTimeout } = require('timers');
const redis = require('redis');
const crypto = require('crypto');

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
    EQFILEMOUNTPT = path.resolve('../../privat_eqconfig/eqconfig.json');
    key = fs.readFileSync(KEYFILEMOUNT);
    cert = fs.readFileSync(CERTFILEMOUNT);
    console.log("cant open keyfile")
}

//scaled and distributed with number of data sources
const WebSocketPORT = 10000
const RedisPORT = 6379

const RedisNodeName = "redis-node"
const RedisNodeAmount = 5 

var REDISCLIENTSUB = {}
var REDISCLIENTREQUEST
var REDISCLIENTPUSH

var WebSocket
var EQCONFIG
var subscriptions ={}

var PASSWD

var formats ={}

function parseEqConfig() 
{
    // Get equipment configuration file from file system
    // It has previously been mounted into the docker container by the "configs"
    // property in the docker-compose.yml
    
    let eqfile = fs.readFileSync(EQFILEMOUNTPT);
    EQCONFIG = JSON.parse(eqfile);
    // console.log(eqconfig)
    console.log(formats);
    PASSWD = EQCONFIG.PASSWD

} 

async function connectToRedis()
{
    var Cluster = {rootNodes:[{url:"redis://redis:"+RedisPORT.toString()}]}
    for(var i= 1; i<=RedisNodeAmount; i++){
        Cluster.rootNodes.push({url:'redis://'+RedisNodeName+"-"+i+":"+RedisPORT.toString()})
    }
    var client = redis.createCluster(Cluster) //XX
    //var client = redis.createClient()
    // EQCONFIG.datasources.forEach( async source=>{
    //     REDISCLIENTSUB[source.key] = client.duplicate()
    //     await REDISCLIENTSUB[source.key].connect()
    // })
    REDISCLIENTPUSH = client.duplicate()
    await REDISCLIENTPUSH.connect()
}

function sendPackettoAllClient(packet){
    WebSocket.clients.forEach(client=>{
        client.send(JSON.stringify(packet))
    })
}

async function setupWebSocket()
{        
    if (EQCONFIG.DNS.useHTTPS == "True" ) {
        const server = https.createServer({key: key, cert: cert });
        server.listen(WebSocketPORT)
        WebSocket = new WebSocketServer({server:server})

        
        
    }else{
        WebSocket = new WebSocketServer({  port: WebSocketPORT, 
                                        host: "0.0.0.0",
                                        clientTracking: true });
    }
}

function setupWebsocketEvents(){
    WebSocket.on('listening', () => {
        console.log("[API]\t" + "WebSocket Server is listening.");
    });
    WebSocket.on('connection', (ws,req) => {
        console.log("[API]\t" + "Successful Client Connection from: " + 
                req.socket.remoteAddress + " now listening for incomming data from source");
        ws.on('close', () => {
            console.log("[API]\t" + "Connection with client at " + 
                ws._socket.remoteAddress + " closed.");
        })
        //Event: Some error with client
        ws.on('error', () => {
            console.log("[API]\t" + "Error communicating with Client at" + 
                ws._socket.remoteAddress);
        }),
        ws.on('message',msg =>{
            data = (JSON.parse(msg))          
            console.log(data);
            //console.log("Password recived is:" + data.Pswd);
            calculateHash(data.Pswd).then(hash=>{
                //console.log(hash);
                if ((hash != PASSWD || PASSWD === undefined) && false){
                    console.log("notifying client about wrong Psswd input");
                    var  packet = {
                        value: "wrong PSWD",
                        utc: Date.now(),
                        key: "PSWD"
                    }
                    ws.send(JSON.stringify(packet))
                }else if(data.Type == "Controll"){
                    var Redispack = {}
                    Object.keys(data).forEach(key =>{
                        if (key.split("$")[1] != undefined){
                            if (!Redispack[key.split("$")[0]]){
                                Redispack[key.split("$")[0]] ={}
                            }
                            console.log(key);
                            Redispack[key.split("$")[0]][key.split("$")[1]] = data[key]
                        }
                    })
                    console.log(Redispack);
                    Object.keys(Redispack).forEach(key =>{
                        PushPacketToRedis(key,Redispack[key],"CONTROL")
                    })
                }else if(data.Type == "Sequence"){
                    var Sequence = data.Sequence
                    PushPacketToRedis(data.Srckey,{Sequence:JSON.stringify(Sequence)},"CONTROL")
                }
            })
            
        })
    });
    WebSocket.on('close', () => {
        console.log("Pushing Websocket Server closed.")
    })
}
function calculateHash(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    return crypto.subtle.digest('SHA-256', data)
        .then(hashBuffer => {
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
        return hashHex;
        });
} 

function PushPacketToRedis(SRC,packet,Type){
    console.log("Pushing to redis")
    console.log(SRC+":"+Type)
    console.log(packet)
    REDISCLIENTPUSH.xAdd(SRC+":"+Type,'*',packet)
}

function WSKeepAlive(){
    setInterval(() => {
        var message = createFrontendPacket("Keepalive")
        message.data[0]=createFrontendData(Date.now(),"keepAlive","keepAlive")
        sendPackettoAllClient(message)
    }, 100);
}

function createFrontendPacket(type,){
    var packet = {
        type: type,
        data:[]
    }
    return packet
}

function createFrontendData(utc,value,key){
    var data={
        utc:parseInt(utc),
        value:value,
        key:key
    }
    return data
}

async function main()
{
    await parseEqConfig();
    await setupWebSocket();
    setupWebsocketEvents();
    WSKeepAlive()
    await connectToRedis();

}


// ### SOFT SHUTDOWN ### //
process.on('SIGTERM', () => {
    console.log("Soft shutdown requested, bye...")
    // Soft close
    destSocket_push.clients.forEach((socket) => {
        socket.close();
    })
    // If a socket somehow stayed open after 5s, close it
    setTimeout(() => {
        destSocket_push.clients.forEach((socket) => {
          if ([socket.OPEN, socket.CLOSING].includes(socket.readyState)) {
            socket.terminate();
          }
        });
        process.exit(0)
      }, 5000);

    // TODO: handle srcSocket closing
})

main();
