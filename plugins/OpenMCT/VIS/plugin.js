// EQ plugin
// Author: Antonio Steiger, Moritz Eisert
// Last Updated: 5.Jauary.2023
// Description: Gets the current equipment configuration file and adds all
// corresponding objects to the openmct tree.

const pluginName = "WARR_EQ_VIS"
let eqconfig = {};
let host = "";
var protocol = "";
var iparray = [];

var calibfunktion = {};

var sockets = {}
var listenerRAW = {}
var listenerVIS = {}
var protocolWS = "ws:"

var ExternalWebsiteAdapters = [
    "locat1d",
    "locat2d",
    "local3d",
    "orient3d"
]

var Video = "video"

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
    return function install(openmct) {

        //This install script HAS TO BE CODED SEQUENTIALLY. This means if you want one function to be called
        //after another, you have to call that function within the first one.

        console.log("[" + pluginName + "]" + " Installing...");
        console.log("[" + pluginName + "]" + " Adding data source folder...");
        addDataSourceFolders();

        //console.log("[" + pluginName + "]" + " Getting equipment configuration");
        getEqConfig();
    }
}

function addDataSourceFolders() {

    // Add "Data Sources" Root Folder
    openmct.objects.addRoot({
        namespace: 'visualization',
        key: 'visualization'
    });
    openmct.objects.addProvider('visualization', {
        get: function (identifier) {
            return Promise.resolve(
                {
                    identifier: identifier,
                    name: 'VIS Data Sources',
                    type: 'folder',
                    location: 'ROOT'
                })
        }
    });

    // Add "Video Folder" To Root Folder
    openmct.objects.addRoot({
        namespace: 'video',
        key: 'video'
    });
    openmct.objects.addProvider('video', {
        get: function (identifier) {
            return Promise.resolve(
                {
                    identifier: identifier,
                    name: 'Video Folder',
                    type: 'folder',
                    location: 'ROOT'
                })
        }
    });

}

function getEqConfig() {
    // Get equipment configuration file from webserver
    protocol = window.location.protocol
    host = window.location.host;
    const url = protocol + '//' + host + '/eq.json';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // This is a synchronous query on purpose!
    // It stops OpenMCT plugin installation flow, to ensure clean domain
    //object tree for when it is accessed later on

    xhr.onload = function () {
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

    if (eqconfig.DNS.useHTTPS == "True") {
        protocolWS = "wss:"
        iparray.push(host.split(":")[0]);
    } else {
        generating_IpArr(eqconfig.computers);
    }

    addDataSources()
}



function addDataSources() {
    addDataSourcesVIS();

    addDataPoints_VIS();

    addTelemetryProviders(); // Register keys as dataproviders

    createWebsockets();
}

function addDataSourcesVIS() {
    // For each data source
    if (eqconfig.datasources) {

        let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

        sources.forEach(source => {
            // Register an object provider for its folder object
            openmct.objects.addProvider(source.key + '_VIS', {
                get: function (identifier) {
                    return Promise.resolve(
                        {
                            identifier: identifier,
                            name: source.name + '_VIS',
                            type: 'folder',
                            location: 'visualization:visualization'
                        })
                }
            });
            openmct.objects.addProvider(source.key + '_CONT', {
                get: function (identifier) {
                    return Promise.resolve(
                        {
                            identifier: identifier,
                            name: source.name + '_CONT',
                            type: 'folder',
                            location: 'controll:controll'
                        })
                }
            });
        });

        //Register a composition provider for the data sources folder
        //This lets OpenMCT know that the data sources folder shall contain
        //a subfolder for each data source
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                return domainObject.identifier.namespace === 'visualization' &&
                    domainObject.identifier.key === 'visualization';
            },
            load: function (domainObject) {
                return Promise.resolve(
                    sources.map(function (s) {
                        return {
                            namespace: s.key + '_VIS',
                            key: s.key
                        };
                    })
                )
            }
        });
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                return domainObject.identifier.namespace === 'controll' &&
                    domainObject.identifier.key === 'controll';
            },
            load: function (domainObject) {
                return Promise.resolve(
                    sources.map(function (s) {
                        return {
                            namespace: s.key + '_CONT',
                            key: s.key
                        };
                    })
                )
            }
        });
    }
    if (eqconfig.Video) {

        eqconfig.Video.forEach( source => {
            // Register an object provider for its folder object
            openmct.objects.addProvider(source.name, {
                get: function (identifier) {
                    return Promise.resolve(
                        {
                        identifier: identifier,
                        name: source.name,
                        type: 'folder',
                        location: 'video:video'
                    })
                }
            });
        });
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                return domainObject.identifier.namespace === 'video' &&
                    domainObject.identifier.key === 'video';
            },
            load: function (domainObject) {
                return Promise.resolve(
                    eqconfig.Video.map(function (s) {
                        return {
                            namespace: s.name,
                            key: s.name
                        };
                    })
                )
            }
        });
    }
}

function recurse_fetch_Folder_Datapoint_Vis(datapoint, source, previous) {
    if (datapoint.type != "folder") {
        if (datapoint.values[0].calib) {
            var funk = "return " + datapoint.values[0].calib
            calibfunktion[datapoint.key] = Function("x", funk)
        }
        else {
            calibfunktion[datapoint.key] = Function("x", "return x")
        }
        //console.log("creating datapoint : "+ source.key + "_" + datapoint.name + "_Raw");
        if (datapoint.values) {
            /* openmct.objects.addProvider(datapoint.key + '_VIS', {
                get: function (identifier) {
                    return Promise.resolve(
                        {
                        identifier: identifier,
                        name: source.key + "_" + datapoint.name + "_VIS",
                        type: source.key + '_datapoint-VIS',
                        location: previous,
                        telemetry: {
                            values: datapoint.values
                        },
                    })
                }
            }); */
            var type = add_right_OPMCT_Type_Datapoints(datapoint,source,previous)
        }
        return {
            namespace: datapoint.key + '_VIS',
            key: datapoint.key + '_VIS',
            type:type
        }
    } else {
        //console.log("creating folder : " + datapoint.name )
        openmct.objects.addProvider(source.key + "_" + datapoint.name + "_VIS", {
            get: function (identifier) {
                return Promise.resolve(
                    {
                        identifier: identifier,
                        name: source.name + "_" + datapoint.name + '_VIS',
                        type: 'folder',
                        location: previous
                    })
            }
        });
        var children = []
        datapoint.values.forEach(points => {
            children.push(recurse_fetch_Folder_Datapoint(points, source, source.key + "_" + datapoint.name + "_VIS:" + source.key + "_" + datapoint.name + "_VIS"))
        })
        let comp = []
        children.forEach(child=>{
            if (child.type =="nummeric")
                comp.push(child)
        })
        if (comp.length >=2){
            children.push(add_Stacked_Plot(datapoint,source,source.key + "_" + datapoint.name + "_VIS:" + source.key + "_" + datapoint.name + "_VIS",comp))
        }
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                if (domainObject.identifier.namespace === source.key + '_' + datapoint.name + '_VIS')
                    //console.log(source.key + '_'+ datapoint.name + '_RAW    was searched for' );
                    return domainObject.identifier.namespace === source.key + '_' + datapoint.name + '_VIS'
            },
            load: function (domainObject) {
                return Promise.resolve(
                    children
                )
            }
        });
        return {
            namespace: source.key + "_" + datapoint.name + "_VIS",
            key: source.key + "_" + datapoint.name + "_VIS"
        }
    }
}

function add_right_OPMCT_Type_Datapoints(datapoint, source, previous) {
    if (ExternalWebsiteAdapters.includes(datapoint.adapter)) {
        openmct.objects.addProvider(datapoint.key + "_VIS",
            {
                get: function (identifier) {
                    return Promise.resolve(
                        {
                            identifier: identifier,
                            name: source.key + "_" + datapoint.name + "_VIS",
                            type: 'webPage',
                            location: previous,
                            url: protocol + '//' + host.split(':')[0] + ':' + datapoint.destport

                        }
                    );
                }
            });
        return "website"
    } else if (datapoint.values[0].format != 'string') {
        openmct.objects.addProvider(datapoint.key + "_VIS",
            {
                get: function (identifier) {
                    return Promise.resolve(
                        {
                            identifier: identifier,
                            name: source.key + '_' + datapoint.name + '_VIS',
                            type: source.key + '_datapoint-VIS',
                            telemetry: {
                                values: datapoint.values
                            },
                            location: previous
                        })
                }
            });
        return "nummeric"
    } else {
        openmct.objects.addProvider(datapoint.key + '_VIS',
            {
                get: function (identifier) {
                    return Promise.resolve(
                        {
                            identifier: identifier,
                            name: source.key + '_' + datapoint.name + '_VIS',
                            type: source.key + '_datapoint-string-VIS',
                            location: previous,
                            telemetry: {
                                values: datapoint.values
                            },
                        }
                    );
                }
            });
        return "string"
    }
}

function add_Stacked_Plot(datapoint,source,previous,comp){
    //console.log(objectarrays[source.key]);
    openmct.objects.addProvider(source.key + '_'+datapoint.name+ "_Overlay_VIS",
        {
            get: function (identifier) {    
                var object =
                {
                    identifier: identifier,
                    name: source.name + '_'+ datapoint.name +"_Overlay_Plot",
                    type: 'telemetry.plot.overlay',
                    location:previous,
                    composition: [
                    ],
                    configuration:
                    {
                        series: [],
                        yAxis: {},
                        xAxis: {},
                        // legend:
                        // {
                        //     expandByDefault: true,
                        //     hideLegendWhenSmall: false,
                        //     showTimestampWhenExpanded: true
                        // },
                        useIndependentTime: true
                    }
                }
                comp.forEach(ident => {
                    object["composition"].push(ident)
                })
                comp.forEach(ident => {
                    var ob = {identifier:ident}
                    object.configuration["series"].push(ob)
                })
                //console.log(object)
                return Promise.resolve(
                    object
                )
            }

        });
    return {namespace:source.key + '_'+datapoint.name+ "_Overlay_VIS",key:source.name + '_'+ datapoint.name +"_Overlay_Plot"}
    
}

function addDataPoints_VIS() {
    let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

    // Add data point type to openmct
    sources.forEach(source => {
        openmct.types.addType(source.key + '_datapoint-VIS', {
            name: source.name + ' VIS Data Point',
            description: 'A single' + source.name +
                'data point. Can represent a float, integer, string and more. Here thei are calibrated and nicely visualized',
            cssClass: 'icon-telemetry'
        });
    });

    sources.forEach(source => {
        openmct.types.addType(source.key + '_datapoint-string-VIS', {
            name: source.name + 'VIS Data Point',
            description: 'A single' + source.name +
                'data point. Can represent a float, integer, string and more.',
            cssClass: 'icon-tabular'
        });
    });
    
    sources.forEach(source => {
        var children = []
        source.datapoints.forEach(point=>{
            children.push(recurse_fetch_Folder_Datapoint(point,source,source.key+"_VIS:"+source.key))
        })
        let comp = []
        children.forEach(child=>{
            if (child.type =="nummeric")
                comp.push(child)
        })
        if (comp.length >=2){
            children.push(add_Stacked_Plot(source,source,source.key+"_VIS:"+source.key,comp))
        }
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                return domainObject.identifier.namespace === source.key + '_VIS' &&
                    domainObject.identifier.key == source.key;
            },
            load: function (domainObject) {
                return Promise.resolve(
                    children
                )
            }
        });
    });


    
    //register Videos to OPENMCT hirarchiy
    eqconfig.Video.forEach(source => {
        source.streams.forEach(stream => {
            var streamobj = Object.entries(stream)[0][1]
            //console.log(streamobj.name);
            openmct.objects.addProvider(streamobj.name,
                {
                    get: function (identifier) {
                        return Promise.resolve(
                            {
                                identifier: identifier,
                                name: streamobj.name,
                                type: 'webPage',
                                location: source.name+':'+source.name,
                                url: protocol + '//' + host.split(':')[0] + ':' + source.Port + source.additional_URL + streamobj.URL_name
                            }
                        );
                    }
                }
            );

        })
    })

    eqconfig.Video.forEach(source => {
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                return domainObject.identifier.namespace === source.name &&
                    domainObject.type === 'folder';
            },
            load: function (domainObject) {
                return Promise.resolve(
                    source.streams.map(function (s) {
                        return {
                            namespace: Object.entries(s)[0][1].name,
                            key: Object.entries(s)[0][1].name
                        };
                    })
                )
            }
        });
    })

}

// Basic socket idear:
//  Every source connects trough every route to the adapter but only one is "active in the sense of geting an on mesaage function and handling the data"
//  Pending socket connections only refresch if they encounter an error or are closed
//  Changing socket connection if an timeout ocures -> no data is recived in an spezified ref: [addEvent_message/Intervall] or the current in used socket is disconnected / has an error

function createWebsockets() {
    eqconfig.datasources.forEach(source => {
        sockets[source.key] = []
        iparray.forEach(ip => {
            var SocketPromis = new Promise((resolve, reject) => {
                //console.log(protocolWS+'//' +ip+':' + source.destport.toString());
                var socket = new WebSocket(protocolWS + '//' + ip + ':' + source.destport.toString()); //creating socket for every ip(route to docker container trough ingress network)
                resolve(socket)
            });
            SocketPromis.then((socket) => {
                //console.log("[" + pluginName + "]"+ source.name + "." + source.key+" --- try creating socket to ip: " + ip) 
                let socketobj = createSocketobjekt(socket) // create the oobject containing all the socket informations
                sockets[source.key].push(socketobj) // every socetobj that is associated with an key is stored in an arry inside an object accesable by source key
                var Interval = setInterval(() => { // set an intervall for reconnection if creation fails
                    recreateSockets(socketobj, source.key, Interval)
                }, 4000);
                socket.onopen = function (e) { clearInterval(Interval); Eventopen(socketobj, source.key) } // if sockets open clear intervall -> no further attemps to reconnect
                //console.log(sockets);
            }).catch((error) => {
                console.log("[" + pluginName + "]" + source.name + "." + source.key + " error creating socket" + error);
            })
        });
    });

}

function recreateSockets(socketobj, key, Interval) { //recreation of socketobjeckt 
    if (socketobj.socket.readyState != 0) { // jump if connection is pending -> eather created or rejected
        var SocketPromis = new Promise((resolve, reject) => {
            resolve(new WebSocket(socketobj.socket.url))
        });
        SocketPromis.then((socket) => {
            //console.log("[" + pluginName + "]"+ socketobj.socket.url+"- reconnecting");
            socketobj.socket = socket; //update Socket object -> js works like it's a pointer
            socket.onopen = function (e) { clearInterval(Interval); Eventopen(socketobj, key) }
            //console.log(sockets);
        }).catch((socket) => {
            //console.log("[" + pluginName + "]"+ socketobj+ " Failed reconnect" + socket) 
        })
    }
}

function createSocketobjekt(socket) {
    let socketobj = {};
    socketobj["socket"] = socket
    socketobj["conne"] = false
    socketobj["inuse"] = false
    socketobj["timeout"] = null;
    return socketobj
}

function Eventopen(socketobj, key) {
    // If the socketconnection is opend flagg is set and Event attached
    // THe socket connections are checked if there is no "active" conection jet -> if no socket is fund that handels onmessage (no inuse flag is true) socket takes over and handles data
    socketobj.conne = true
    var socket = socketobj.socket
    //console.log("[" + pluginName + "]"+  socket.url +" connection open");
    EventError(socketobj, key)
    var use = false;
    sockets[key].forEach(socket => {
        if (socket.inuse) {
            //console.log("[" + pluginName + "]"+ "found already in use socket")
            use = true
        }
    })
    if (!use) {
        socketobj.inuse = true;
        addEvent_messgae(socketobj)
    }
}

function EventError(socketobj, key) {
    // Function adds the specific evens like on error -> socket is closed and on close is handled
    //  on close periodical reconection attems and use of other socket
    // corresponding flags are set to false
    var socket = socketobj.socket

    socket.onerror = function (msg) {
        //console.log("[" + pluginName + "]"+ socket.url + " ---socket error:"+ msg + " , closing socket and try reconnecting")
        socketobj.inuse = false
        socketobj.conne = false
        socket.close()
    }

    socket.onclose = function (msg) {
        //console.log("[" + pluginName + "]"+ socket.url + " ---Websocket closed"+ msg +" try reconnecting")
        if (socketobj.inuse) {
            useSocket(key) // If socket was in use -> new usable socket is searched
        }
        socketobj.inuse = false
        socketobj.conne = false
        var Interval = setInterval(() => {
            recreateSockets(socketobj, key, Interval)
        }, 4000);
    }

}



function useSocket(key) {
    //console.log("[" + pluginName + "]"+ key+ " new already created usable sockets are searched")
    sockets[key].forEach(socketobj => {
        if (socketobj.conne) { // first socket object that is considered to be connected is set active
            socketobj.inuse = true
            //console.log("[" + pluginName + "]"+ key+ " now using socket"+ socketobj.socket.url)
            addEvent_messgae(socketobj)
            return
        }
    });
}



function addEvent_messgae(socketobj) {
    var socket = socketobj.socket;
    var timeout = 3000; ///XXX maybe set timeout according to timeout specification on eq.json
    socketobj.timeout = window.setTimeout(function () {
        //console.log("[" + pluginName + "]"+ socket.url +"timeout exided")
        socket.close(); // set an timeout if no data is recived  (seemed like an good idea because sometimes webbroser dos not detect lost connections -> simply waits for further respons)
    }, timeout)
    socket.onmessage = function (msg) {
        clearTimeout(socketobj.timeout) // only way to reset an timeout -> clear it and recreate
        socketobj.timeout = window.setTimeout(function () {
            //console.log("[" + pluginName + "]"+ socket.url +"timeout exided")
            socket.close();
        }, timeout)
        let datapoint = JSON.parse(msg.data);
        // socketobj["key"]=datapoint.key; //controll instance which key is served -> incressnetwork might connect to random container of that port range

        if (listenerVIS[datapoint.key + "_VIS"]) {
            let datapoint2 = datapoint
            datapoint2.value = calibfunktion[datapoint.key](datapoint.value)
            listenerVIS[datapoint.key + "_VIS"](datapoint2); // OPMCT stuff -> in listener obj the pointer to the corresponding function is found that handles the data of resiced msg.key
        }else if(datapoint.key== "PFC.V1"){listenerVIS[datapoint.key](datapoint.value)}

        if (datapoint.key == '_CONN_') {
            //CONN.notify(source.key, datapoint.value); 
        }
    };
}

function addTelemetryProviders() {
    let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

    sources.forEach(source => {
        // Add Telemetry Provider
        openmct.telemetry.addProvider({
            /*canProvideTelemetry(domainObject) {     //PFC_Provider can only provide telemetry to pfc objects
                return domainObject.type === source.key + '_visualization';
            },*/
            supportsSubscribe: function (domainObject) {
                return domainObject.type === source.key + '_datapoint-VIS' || domainObject.type === source.key + '_datapoint-string-VIS'
            },
            subscribe: function (domainObject, callback) {
                console.log(domainObject.identifier.key);
                listenerVIS[domainObject.identifier.key] = callback;
                return function unsubscribe() {
                    delete listenerVIS[domainObject.identifier.key];
                    //delete sockets[domainObject.identifier.key];
                };
            }
        });
    })
    
    // Add Telemetry Provider
    openmct.telemetry.addProvider({
        /*canProvideTelemetry(domainObject) {     //PFC_Provider can only provide telemetry to pfc objects
            return domainObject.type === source.key + '_visualization';
        },*/
        supportsSubscribe: function (domainObject) {
            return domainObject.type === "ControllButton"
        },
        subscribe: async function (domainObject, callback) {
            console.log(domainObject.command);
            listenerVIS[domainObject.command+ '_VIS'] = callback;
            return function unsubscribe() {
                delete listenerVIS[domainObject.command+'_VIS'];
                //delete sockets[domainObject.identifier.key];
            };
        }
    });
        
    
}

function generating_IpArr(computers) {
    var url = host.split(":")[0];
    computers.forEach(comp => {
        iparray.push(comp.ip);
    });
    if (!iparray.includes(url)) {
        iparray.push(url)
    }
    //console.log("[" + pluginName + "]" + " IPs to try: " + iparray);
}