var argv = require('minimist')(process.argv.slice(2))
const https = require('https');
const WebSocketServer = require('ws').Server
const fs = require('fs');
const path = require('path');
const { clearTimeout } = require('timers');
const redis = require('redis');

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

// The equipment configuration is mounted into the adapters'
// docker container by docker swarm using the "configs" property
// in docker-compose.yml
const TASKSLOT = argv._[0]; 
//The task slot identifies the replica number of this adapter.
//If the task slot is 1, the adapter is supposed to ONLY handle
//the first tcp source in the eqconfig. This way, adapters can be
//scaled and distributed with number of data sources
const WebSocketPORT = 9100
const RedisPORT = 6379

var REDISCLIENTSUB = {}
var REDISCLIENTREQUEST
const RedisNodeName = "redis-node"
const RedisNodeAmount = 5
var WebSocket
var EQCONFIG
var subscriptions ={}

var formats ={}



function parseEqConfig() 
{
    // Get equipment configuration file from file system
    // It has previously been mounted into the docker container by the "configs"
    // property in the docker-compose.yml
    
    let eqfile = fs.readFileSync(EQFILEMOUNTPT);
    EQCONFIG = JSON.parse(eqfile);
    // console.log(eqconfig)
    createFormats()
    console.log(formats);
}  

function recurseGetFormats(point,basekey){
    if(point.type != "folder"){
        formats[basekey+'$'+point.key] = point.values[0].format
        //return TypeOb
    }else{
        point.values.forEach(Subpoint=>{
          recurseGetFormats(Subpoint,basekey)  
        })
    }
}

function createFormats (){
    EQCONFIG.datasources.forEach(source=>{
        var basekey = source.key
        for (const point of source.datapoints) {
            recurseGetFormats(point,basekey)
        }
    })
}

async function connectToRedis()
{
    var Cluster = {rootNodes:[{url:"redis://redis-node-master:"+RedisPORT.toString()}]}
    for(var i= 1; i<=RedisNodeAmount; i++){
        Cluster.rootNodes.push({url:'redis://'+RedisNodeName+"-"+i+":"+RedisPORT.toString()})
    }
    var client = redis.createCluster(Cluster) //XX
   // var client = redis.createClient()
    EQCONFIG.datasources.forEach( async source=>{
        REDISCLIENTSUB[source.key] = client.duplicate()
        await REDISCLIENTSUB[source.key].connect()
    })
    REDISCLIENTREQUEST = client.duplicate()
    await REDISCLIENTREQUEST.connect()
}

async function redis_handler(key, id) {
    let stream = { key: key+':DATA', id: id }
    REDISCLIENTSUB[key].xRead([stream], {BLOCK:500}).then((str) => {
        if (str !== null) {
            console.log(new Date().toLocaleTimeString() + " received datapoints");
            ParseRedisData(str,sendPackettoAllClient)
            setTimeout(() => redis_handler(key, id), 0);
        }
    });
}

async function RedisSubscribe(){
    EQCONFIG.datasources.forEach(source => {
        console.log("Subscribing to: " + source.key+":DATA");
        await redis_handler(source.key, '$');
    })
}

function ParseRedisData(RedisStr,ResultCall){
    var basekey = RedisStr[0].name.split(':')[0]
    RedisStr[0].messages.forEach(message=>{
        var utc = message.id.split('-')[0]
        Object.keys(message.message).forEach(key=>{
            console.log(key);
            var packet = createFrontendPacket("RealtimeData")
            packet.data[0] = createFrontendData(parseInt(utc),parsedata(message.message[key],formats[basekey+'$'+key]),basekey+'$'+key)
            console.log(packet);
            ResultCall(packet)
        })
    })
}
function parsedata(value,format){
    switch (format) {
        case "float":
            value = parseFloat(value);
            break;
        case "integer":
            value = parseInt(value);
            break; 
        case "string":
            value = value.toString()
            break;
        default:
            value = value
            break;
    }
    return value
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
                    var data = JSON.parse(msg)
                    console.log(data)
                    var options = data.options
                    var Table = data.key.split("$")[0]+":DATA"
                    var key = data.key.split("$")[1]
                    RequestHist(Table,options.start,options.end,0).then(results =>{
                        var response = createFrontendPacket("RequestResponse$"+data.key)
                        results.forEach(result=>{
                            if (result.message[key] != undefined){
                                var packet = createFrontendData(parseInt(result.id.split('-')[0]),parsedata(result.message[key],formats[data.key]),data.key)
                                response.data.push(packet)
                            }
                        })
                        console.log("Sendin:" + key + "to "+ ws._socket.remoteAddress);
                        console.log(response)
                        ws.send(JSON.stringify(response))
                    })
                })
    });
    WebSocket.on('close', () => {
        console.log("Pushing Websocket Server closed.")
    })
}

function RequestHist(Table,start,end,count){
    return new Promise((resolve) => {
        resolve (REDISCLIENTREQUEST.XRANGE(Table,Math.floor(start).toString(),Math.floor(end).toString(),"COUNT",count));
    })
}

function WSKeepAlive(){
    setInterval(() => {
        var message = createFrontendPacket("Keepalive")
        message.data[0]=createFrontendData(Date.now(),"keepAlive","keepAlive")
        sendPackettoAllClient(message)
    }, 1000);
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
    await RedisSubscribe();

    // var client = redis.createClient()
    // await client.connect()
    // console.log("Subs");

    // var Data = await client.XRANGE("PFC_TEL:DATA",'-','+')
    // console.log(Data);


    // const xread = (stream = { key, id }) => {
    //     client.xRead([stream], {BLOCK:0}).then((str) => {
    //       console.log(JSON.stringify(str))
    //       setTimeout(() => xread(stream), 0)
    //     });
    //   }
      
    //   xread({ key: 'PFC_TEL:DATA', id: '$' })
    //   console.log("sachen");
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
