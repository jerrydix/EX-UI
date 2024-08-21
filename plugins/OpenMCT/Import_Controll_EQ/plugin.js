const pluginName = "WARR_EQ_Controll_Import"
let eqconfig = {};
let host = "";
var protocol = "";
var iparray = [];

var ControllRootCollection
var ControllRootIdentifier
var ControllRootObject
var Identifierfirstlayer = {}

var sockets = {}
var listenerRAW = {}
var listenerVIS = {}
var protocolWS = "ws:"

import { v4 as uuid } from 'uuid';
import { createMyItemsIdentifier } from "./createMyItemsIdentifier";

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
        await addDataSourceFolders();

        //console.log("[" + pluginName + "]" + " Getting equipment configuration");
        await getEqConfig();
        await addDataSources()
    }
}

async function addDataSourceFolders() {

    const identifier = createMyItemsIdentifier("");
    ControllRootIdentifier = identifier
    var priority = openmct.priority.MEDIUM;
        
    /* openmct.objects.addGetInterceptor(myItemsInterceptor(openmct, identifier, "Controll"));
    openmct.objects.addRoot(identifier, priority); */

    let domainObject = {
        name: "Controll",
        type: 'folder',
        identifier: identifier,
        location:"ROOT",
        composition:[],
        modified: Date.now()
    };
    await openmct.objects.save(domainObject)
    openmct.objects.addRoot(identifier,priority)

    ControllRootObject = await openmct.objects.get(identifier)
    ControllRootCollection = await openmct.composition.get(ControllRootObject)
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
        //generating_IpArr(eqconfig.computers);
    }


   
}
async function addDataSources() {
    await addDataSourcesControll();
    
    await addDataPoints_CONT();
    
    //addTelemetryProviders(); // Register keys as dataproviders

}

function addDataSourcesControll() {
    // For each data source
    if (eqconfig.datasources) {
        let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

        sources.forEach(async (source) => {
            if(source.Controlls != undefined){
                let domainObject = {
                    name: source.name,
                    type: 'folder',
                    identifier: {
                        key: source.name,
                        namespace: ControllRootIdentifier.namespace
                    },
                    location:openmct.objects.makeKeyString(ControllRootIdentifier),
                    composition:[],
                    modified: Date.now()
                };
                Identifierfirstlayer[source.key]=domainObject.identifier
                await openmct.objects.save(domainObject)
                ControllRootCollection.add(domainObject)
                console.log("added "+source.name+" Folder");
            }
        });
    }
}

async function recurse_fetch_Folder_Controll(Controll, source, previousIdentifier, previousCollection) {
    if (Controll.type != "folder") {
        var Cont =  await add_right_OPMCT_Type_Controlls(Controll,source,previousIdentifier)
        //console.log(Cont);
        await previousCollection.add(Cont.domainObject)
        //console.log("adding: "+ Controll.name);
        return Cont.type
    } else {

        let domainObject = {
            name: Controll.name,
            type: 'folder',
            identifier: {
                key: (source.name +"$"+Controll.name+"$CON").replace(/ /g,"$"),
                namespace: ControllRootIdentifier.namespace
            },
            location:openmct.objects.makeKeyString(previousIdentifier),
            composition:[],
            modified: Date.now()
        };
        await openmct.objects.save(domainObject)
        previousCollection.add(domainObject)

        var thisCollection = await openmct.composition.get(domainObject)
        
        Controll.values.forEach(async points => {
            await recurse_fetch_Folder_Controll(points, source, domainObject.identifier,thisCollection)

        })

        return {type:"folder",domainObject:domainObject}
    }
}

function Buttondefault (ButtonOb){
    if(ButtonOb.default!= undefined){
        return ButtonOb.default
    }
    return 2
}
async function add_right_OPMCT_Type_Controlls(Controll, source, previousIdentifier) {
    if(Controll.type === "toggle"){
        let domainObject = {
            name: source.key + "_"+ Controll.name,
            type: 'OPCToggleButton',
            identifier: {
                key: (source.key+"$"+Controll.key+"$CON").replace(/ /g,"_"),
                namespace: previousIdentifier.namespace
            },
            location:openmct.objects.makeKeyString(previousIdentifier),
            control_key: Controll.key,
            //reset: 0 || Controll.autoreset,
            modified: Date.now()
        };
        var sucsess = await openmct.objects.save(domainObject)
        //console.log(sucsess);
        return {type:"Button",domainObject:domainObject}
    } else if(Controll.type === "boolV2"){
        let domainObject = {
            name: source.key + "_"+ Controll.name,
            type: 'ControllButtonV2',
            identifier: {
                key: (source.key+"$"+Controll.key+"$CON").replace(/ /g,"_"),
                namespace: previousIdentifier.namespace
            },
            location:openmct.objects.makeKeyString(previousIdentifier),
            command: Controll.key,
            //reset: 0 || Controll.autoreset,
            state: false,
            transition: Buttondefault(Controll),
            modified: Date.now()
        };
        var sucsess = await openmct.objects.save(domainObject)
        //console.log(sucsess);
        return {type:"Button",domainObject:domainObject}
    } else if(Controll.type === "bool"){
        let domainObject = {
            name: source.key + "_"+ Controll.name,
            type: 'ControllButton',
            identifier: {
                key: (source.key+"$"+Controll.key+"$CON").replace(/ /g,"_"),
                namespace: previousIdentifier.namespace
            },
            location:openmct.objects.makeKeyString(previousIdentifier),
            command: source.key+'$'+Controll.key,
            //reset: 0 || Controll.autoreset,
            state: false,
            transition: Buttondefault(Controll),
            modified: Date.now()
        };
        var sucsess = await openmct.objects.save(domainObject)
        //console.log(sucsess);
        return {type:"Button",domainObject:domainObject}
    }else if(Controll.type === "integer"){
        let domainObject = {
            name: source.key + "_"+ Controll.name,
            type: 'StringControll',
            identifier: {
                key: (source.key+"$"+Controll.name+"$CON").replace(/ /g,"_"),
                namespace: previousIdentifier.namespace
            },
            location:openmct.objects.makeKeyString(previousIdentifier),
            command: source.key +"$"+ Controll.key,
            inputtype:Controll.inputtype,
            max : Controll.max,
            min : Controll.min,
            range : Controll.range,
            state: "",
            transition: "",
            modified: Date.now()
        };
        var sucsess = await openmct.objects.save(domainObject)
        //console.log(sucsess);
        return {type:"INT",domainObject:domainObject}
    }
}


function add_ControllTable(Controll,source,previous,comp){
    //console.log(objectarrays[source.key]);
    openmct.objects.addProvider(source.key + '_'+Controll.name+ "_ControllTable",
        {
            get: function (identifier) {
                var object =
                {
                    identifier: identifier,
                    name: source.name + '_'+ Controll.name +"_ControllTable",
                    type: 'ControllTable',
                    location:previous,
                    composition: [
                    ]
                }
                comp.forEach(ident => {
                    object["composition"].push(ident)
                })
                //console.log(object)
                return Promise.resolve(
                    object
                )
            }

        });
    return {namespace:source.key + '_'+Controll.name+ "_ControllTable",key:source.name + '_'+ Controll.name +"_ControllTable"}
    
}

function add_FluidPlan(Controll,source,previous,comp){
    //console.log(objectarrays[source.key]);
    openmct.objects.addProvider(source.key + '_'+Controll.name+ "_FluidPlan",
        {
            get: function (identifier) {
                var object =
                {
                    identifier: identifier,
                    name: source.name + '_'+ Controll.name +"_FluidPlan",
                    type: 'FluidPlan',
                    location:previous,
                    composition: [
                    ]
                }
                comp.forEach(ident => {
                    object["composition"].push(ident)
                })
                //console.log(object)
                return Promise.resolve(
                    object
                )
            }

        });
    return {namespace:source.key + '_'+Controll.name+ "_FluidPlan",key:source.name + '_'+ Controll.name +"_FluidPlan"}
    
}

async function addDataPoints_CONT() {
    let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

    sources.forEach(async (source) => { 
        //try {
        if (source.Controlls){
            var domainComp = await openmct.composition.get(await openmct.objects.get(Identifierfirstlayer[source.key]))
            source.Controlls.Inputs.forEach(async Cont=>{
                await recurse_fetch_Folder_Controll(Cont,source,Identifierfirstlayer[source.key],domainComp)
                //console.log("next")
            })
        }
    });

}

