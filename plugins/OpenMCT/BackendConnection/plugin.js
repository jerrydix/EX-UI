// EQ plugin
// Author: Antonio Steiger, Moritz Eisert
// Last Updated: 5.Jauary.2023
// Description: Gets the current equipment configuration file and adds all
// corresponding objects to the openmct tree.




const pluginName = "WARR_BackendConnection"
let eqconfig = {};
let host = "";
var protocol = "";
var iparray = [];

var calibfunktion = {};

var WS = null
var WebsocketPort = 9100
var timeouttime = 1500
var MaxRetries = 5
var timeoutRetries = 0
var timeout
var connTimeout = null
var socketInterval = null
var protocolWS = "ws:"


var listenerRAW = {}
var listenerVIS = {}
var listenerCommand = {}
var listenerCommandV2 = {}

var RequestPromisesRAW={}
var RequestPromisesVIS={}


//update this list in VIS, EQ, BackedConnection, ImportControllEQ plugins
let excludeDatapointsFromSources = ["RPC"]
let excludeDatasourceFilterFunc = (source => {
    for (let i = 0; i < excludeDatapointsFromSources.length; i++) {
        if (source.key === excludeDatapointsFromSources[i]) {
            return false;
        }
    }
    return true;
})

export default function () {
    return async function install(openmct) {

        //This install script HAS TO BE CODED SEQUENTIALLY. This means if you want one function to be called
        //after another, you have to call that function within the first one.
        
        console.log("[" + pluginName + "]" + " Installing...");
        console.log("[" + pluginName + "]" + " Adding data source folder...");
        

        await getEqConfig();
        createWebsocket();
        addTelemetryProviders()
    }
}

function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


function getEqConfig()
{
    // Get equipment configuration file from webserver
    protocol = window.location.protocol
    host = window.location.host;
    const url = protocol+'//' + host + '/eq.json';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // This is a synchronous query on purpose!
    // It stops OpenMCT plugin installation flow, to ensure clean domain
    //object tree for when it is accessed later on

    xhr.onload = function() {
        var status = xhr.status;

        if (status == 200) {
            eqconfig = JSON.parse(xhr.response);
            console.log("[" + pluginName + "]" + " Successfully fetched equipment config.")
        }
        else {
            consolee.error("[" + pluginName + "]" + "ERROR fetching equipment configuration: " + xhr.status);
        }
    };

    xhr.send();

    if (eqconfig.DNS.useHTTPS == "True"){
        protocolWS = "wss:"
        iparray.push(host.split(":")[0]);
    }else{
        generating_IpArr(eqconfig.computers);
    }

    let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

    sources.forEach(source => {
        recursegetCalib(source.datapoints,source)
    })
    
}

function recursegetCalib(point,source){
    point.forEach(subpoint =>{
        if (subpoint.type != "folder"){
            if (subpoint.values[0].calib){
                var funk = "return " + subpoint.values[0].calib
                calibfunktion[source.key+"$"+subpoint.key] = Function("x", funk)
            }
            else{
                calibfunktion[source.key+"$"+subpoint.key] = Function("x", "return x")
            }
        }else{
            recursegetCalib(subpoint.values,source)
        }

    })

}

function generating_IpArr(computers){
    var url = host.split(":")[0];
    computers.forEach(comp => {
        iparray.push(comp.ip);
    });
    if (!iparray.includes(url)){
        iparray.push(url)
    }
    
}

function createWebsocket(){
    clearInterval(socketInterval)

    if (WS != null) {
        WS.close()
    }

    var ip = iparray[(Math.random() * iparray.length) | 0]
    console.log("[" + pluginName + "] WS connecting...")
    WS = new WebSocket(protocolWS+'//'+ip+':'+WebsocketPort)

    connTimeout = setTimeout(() => {
        console.log("[" + pluginName + "] WS " + WS.url + " connection timed out, retrying...")
        WS.close()
        createWebsocket()
    }, timeouttime);

    WSEvents()
}

function WSSendKeepalive() {
    //WS.send(JSON.stringify({
    //    msg_type: 'keepalive',
    //}));
}

function WSEvents(){
    WS.onerror = function (msg){
        console.log("[" + pluginName + "] WS "+ WS.url + " socket error: "+ msg + " , closing socket and try reconnecting")
        WS.close()
    }
    WS.onclose = function (msg){
        console.log("[" + pluginName + "] WS "+ WS.url + " closed:" + msg +" try reconnecting")
    }
    WS.onopen = function (msg){
        clearTimeout(connTimeout)
        WSSendKeepalive()
        socketInterval = setInterval(() => {
            WSSendKeepalive()
        });

        addEvent_messgae()
        console.log("[" + pluginName + "] WS "+ WS.url + " connected")
        createSocketTimeout()
    }
}

function createSocketTimeout(){
    timeout = setTimeout(async ()=>{
        console.log("[" + pluginName + "] WS "+ WS.url + " timed out during operation")
        createWebsocket()
    },timeouttime)
}

function addEvent_messgae(){
    WS.onmessage = function (msg) {
        clearTimeout(timeout)
        timeoutRetries = 0
        createSocketTimeout()
        let datapoint = JSON.parse(msg.data);
        if(datapoint.type == "RealtimeData"){
            for (const d of datapoint.data) {
                // console.log(datapoint);
                // console.log(listenerCommand)
                if (listenerRAW[d.key + "$RAW"]) {
                    listenerRAW[d.key+ "$RAW"](d); // OPMCT stuff -> in listener obj the pointer to the corresponding function is found that handles the data of resiced msg.key
                }   
                if (listenerCommand[d.key+"$CON"]){
                    listenerCommand[d.key+"$CON"](d)
                }

                if (listenerCommandV2[d.key+"$CON"]){
                    listenerCommandV2[d.key+"$CON"](d)
                }

                if (listenerVIS[d.key + "$VIS"]) {
                    var data = calibfunktion[d.key](d.value)
                    d.value = data
                    listenerVIS[d.key+ "$VIS"](d); // OPMCT stuff -> in listener obj the pointer to the corresponding function is found that handles the data of resiced msg.key
                } 
            }
            
            if(datapoint.key == '_CONN_') {
                //CONN.notify(source.key, datapoint.value); 
            }
        }else if (datapoint.type.includes("RequestResponse") ){
            if (RequestPromisesRAW[datapoint.type.replace("RequestResponse$","")]){
                if (datapoint.data[0]) {
                    RequestPromisesRAW[datapoint.type.replace("RequestResponse$","")].resolver(datapoint.data)
                } else {
                    RequestPromisesRAW[datapoint.type.replace("RequestResponse$","")].rejecter()
                }
            }else{
                if (datapoint.data[0]) {
                    datapoint.data.forEach(point =>{
                        point.value = calibfunktion[point.key.replace("$VIS","")](point.value)
                    })
                    RequestPromisesVIS[datapoint.type.replace("RequestResponse$","")].resolver(datapoint.data)
                } else {
                    RequestPromisesVIS[datapoint.type.replace("RequestResponse$","")].rejecter()
                }
                
            }
        };
    }   
}

    
function addTelemetryProviders()
{   

    let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);
    // For each Data Source
    sources.forEach(source => {
        // Add Telemetry Provider
        openmct.telemetry.addProvider({
            /*canProvideTelemetry(domainObject) {     //PFC_Provider can only provide telemetry to pfc objects
                return domainObject.type === source.key + '_datasource';
            },*/
            //supportsRequest: function (domainObject) {
            //    return domainObject.type === source.key + '_datapoint-RAW'
            //},
            //request: function (domainObject, options) {
            //    //console.log(options);
            //    WS.send(JSON.stringify({key:domainObject.identifier.key,options:options}))
            //    var resolver,rejecter
            //    RequestPromisesRAW[domainObject.identifier.key] ={ Promis:new Promise((resolve,reject)=>{
            //        resolver = resolve
            //        rejecter = reject
            //    }),resolver:resolver,rejecter:rejecter}
            //
            //    return RequestPromisesRAW[domainObject.identifier.key].Promis
            //     
            //},
            supportsSubscribe: function (domainObject) {
                return domainObject.type === source.key + '_datapoint-RAW'
            },
            subscribe: function (domainObject, callback) {
                listenerRAW[domainObject.identifier.key] = callback;
                return function unsubscribe() {
                    delete listenerRAW[domainObject.identifier.key];
                    //delete sockets[domainObject.identifier.key];
                };
            }
        });
    })


    sources.forEach(source => {
        // Add Telemetry Provider
        openmct.telemetry.addProvider({
            supportsRequest: function (domainObject) {
                return domainObject.type === source.key + '_datapoint-VIS' || domainObject.type === source.key + '_datapoint-string-VIS'
            },
            request: function (domainObject, options) {
                //console.log(options);
                WS.send(JSON.stringify({key:domainObject.identifier.key,options:options}))
                var resolver,rejecter
                RequestPromisesVIS[domainObject.identifier.key] ={ Promis:new Promise((resolve,reject)=>{
                    resolver = resolve
                    rejecter = reject
                }),resolver:resolver,rejecter:rejecter}
            
                return RequestPromisesVIS[domainObject.identifier.key].Promis
                 
            },
            supportsSubscribe: function (domainObject) {
                return domainObject.type === source.key + '_datapoint-VIS' || domainObject.type === source.key + '_datapoint-string-VIS'
            },
            subscribe: function (domainObject, callback) {
                listenerVIS[domainObject.identifier.key] = callback;
                return function unsubscribe() {
                    delete listenerRAW[domainObject.identifier.key];
                    //delete sockets[domainObject.identifier.key];
                };
            }
        });

        openmct.telemetry.addProvider({
            supportsSubscribe: function (domainObject) {
                return domainObject.type === "ControllButton"
            },
            subscribe: function (domainObject, callback) {
                listenerCommand[domainObject.identifier.key] = callback;
                return function unsubscribe() {
                    delete listenerCommand[domainObject.identifier.key];
                    //delete sockets[domainObject.identifier.key];
                };
            }
        });

        openmct.telemetry.addProvider({
            supportsSubscribe: function (domainObject) {
                return domainObject.type === "ControllButtonV2"
            },
            subscribe: function (domainObject, callback) {
                listenerCommandV2[domainObject.identifier.key] = callback;
                return function unsubscribe() {
                    delete listenerCommandV2[domainObject.identifier.key];
                    //delete sockets[domainObject.identifier.key];
                };
            }
        });
    })

}

