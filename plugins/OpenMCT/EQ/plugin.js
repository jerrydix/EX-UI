// EQ plugin
// Author: Antonio Steiger, Moritz Eisert
// Last Updated: 5.Jauary.2023
// Description: Gets the current equipment configuration file and adds all
// corresponding objects to the openmct tree.

const pluginName = "WARR_EQ"
let eqconfig = {};
let host = "";
var protocol = "";


var ExternalWebsiteAdapters = [
    "locat1d",
    "locat2d",
    "local3d",
    "orient3d"
]

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
        
        addDataSourceFoldersVis();
        addDataSourceFoldersVideo();
        addDataSourceFoldersRAW();

        //console.log("[" + pluginName + "]" + " Getting equipment configuration");
        getEqConfig();
    }
}

function addDataSourceFoldersRAW()
{
    // Add "Data Sources" Root Folder
    openmct.objects.addRoot({
        namespace: 'dataraw',
        key: 'dataraw'
    });
    openmct.objects.addProvider('dataraw', {
        get: function (identifier) {
            return Promise.resolve(
                {
                identifier: identifier,
                name: 'RAW Data Sources',
                type: 'folder',
                location: 'ROOT'
            })
        }
    });
}

function addDataSourceFoldersVis() {

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
}

function addDataSourceFoldersVideo(){
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

    addDataSources()
}



function sleep(ms) 
{
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function addDataSources(){

    addDataSourcesVIS()
    addDataPoints_VIS()

    addDataSourcesRAW();
    addDataPoints_RAW();

}

function addDataSourcesRAW()
{
    let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

    // For each data source
    sources.forEach(source => {
        // Register an object provider for its folder object
        openmct.objects.addProvider(source.key + "$RAW", {
            get: function (identifier) {
                return Promise.resolve(
                    {
                    identifier: identifier,
                    name: source.name + '_RAW',
                    type: 'folder',
                    location: 'dataraw:dataraw'
                })
            }
        });
    });
    
    //Register a composition provider for the data sources folder
    //This lets OpenMCT know that the data sources folder shall contain
    //a subfolder for each data source
    openmct.composition.addProvider({
        appliesTo: function (domainObject) {
            if (domainObject.identifier.namespace === 'dataraw')
                    //console.log("Datasource was searched for");
            return domainObject.identifier.namespace === 'dataraw'
        },
        load: function (domainObject) {
            return Promise.resolve(
                sources.map(function (s) {
                    return {
                        namespace: s.key + "$RAW",
                        key: s.key
                    };
                })
            )
        }
    });  
}


function recurse_fetch_Folder(datapoint, source, previous){
    if (datapoint.type != "folder"){
        //console.log("creating datapoint : "+ source.key + "_" + datapoint.name + "_Raw");
        if(datapoint.values) {
            openmct.objects.addProvider(source.key+'$'+ datapoint.key + '$RAW', {
                get: function (identifier) {
                    return Promise.resolve(
                        {
                        identifier: identifier,
                        name: source.key + "_" + datapoint.name + "_Raw",
                        type: source.key + '_datapoint-RAW',
                        location: previous,
                        telemetry: {
                            values: datapoint.values
                        },
                    })
                }
            });
        }
        return {namespace: source.key+'$'+datapoint.key + '$RAW',
                key: source.key+'$'+datapoint.key + '$RAW'}
    }else{
        //console.log("creating folder : " + datapoint.name )
        openmct.objects.addProvider(source.key +"$"+ datapoint.name + "$RAW", {
            get: function (identifier) {
                return Promise.resolve(
                    {
                    identifier: identifier,
                    name: source.name + "_" + datapoint.name + '_RAW',
                    type: 'folder',
                    location: previous
                })
            }
        });
        var children = []
        datapoint.values.forEach(points =>{
            children.push(recurse_fetch_Folder(points, source,source.key + "$" + datapoint.name + "$RAW:"+source.key + "$" + datapoint.name + "$RAW"))
        })
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                if (domainObject.identifier.namespace === source.key + '$'+ datapoint.name + '$RAW')
                    //console.log(source.key + '_'+ datapoint.name + '_RAW    was searched for' );
                return domainObject.identifier.namespace === source.key + '$'+ datapoint.name + '$RAW'
            },
            load: function (domainObject) {
                return Promise.resolve(
                    children
                )
            }
        });
        return { namespace : source.key + "$" + datapoint.name + "$RAW",
                    key: source.key + "$" + datapoint.name + "$RAW"}
    }
}

function addDataPoints_RAW()
{
    let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

    // Add data point type to openmct
    sources.forEach(source => {
        openmct.types.addType(source.key + '_datapoint-RAW', {
            name: source.name + ' Raw Data Point',
            description: 'A single' + source.name + 
                'data point. Can represent a float, integer, string and more. They are raw measured data the calibrated and by special adapter visualized datasets can be seen in visualiziation',
            cssClass: 'icon-telemetry'
        });
    });
    
    
    //for each data point of every data source, register an object provider
    sources.forEach(source => {
            var children = []
            source.datapoints.forEach(point=>{
                children.push(recurse_fetch_Folder(point,source,source.key+"$RAW:"+source.key))
            })
            openmct.composition.addProvider({
                appliesTo: function (domainObject) {
                    return domainObject.identifier.namespace === source.key + '$RAW' &&
                        domainObject.identifier.key == source.key;
                },
                load: function (domainObject) {
                    return Promise.resolve(
                        children
                    )
                }
            });
        //}
    });


}

function addDataSourcesVIS() {

    // For each data source
    if (eqconfig.datasources) {

        let sources = eqconfig.datasources.filter(excludeDatasourceFilterFunc);

        sources.forEach(source => {
            // Register an object provider for its folder object
            openmct.objects.addProvider(source.key + '$VIS', {
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
            // openmct.objects.addProvider(source.key + '_CONT', {
            //     get: function (identifier) {
            //         return Promise.resolve(
            //             {
            //                 identifier: identifier,
            //                 name: source.name + '_CONT',
            //                 type: 'folder',
            //                 location: 'controll:controll'
            //             })
            //     }
            // });
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
                            namespace: s.key + '$VIS',
                            key: s.key
                        };
                    })
                )
            }
        });
        // openmct.composition.addProvider({
        //     appliesTo: function (domainObject) {
        //         return domainObject.identifier.namespace === 'controll' &&
        //             domainObject.identifier.key === 'controll';
        //     },
        //     load: function (domainObject) {
        //         return Promise.resolve(
        //             sources.map(function (s) {
        //                 return {
        //                     namespace: s.key + '_CONT',
        //                     key: s.key
        //                 };
        //             })
        //         )
        //     }
        // });
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

function recurse_fetch_Folder_Datapoint(datapoint, source, previous) {
    if (datapoint.type != "folder") {
        // if (datapoint.values[0].calib) {
        //     var funk = "return " + datapoint.values[0].calib
        //     calibfunktion[datapoint.key] = Function("x", funk)
        // }
        // else {
        //     calibfunktion[datapoint.key] = Function("x", "return x")
        // }
        if (datapoint.values) {
            var type = add_right_OPMCT_Type_Datapoints(datapoint,source,previous)
        }
        return {
            namespace: source.key+'$'+datapoint.key + '$VIS',
            key: source.key+'$'+datapoint.key + '$VIS',
            type:type
        }
    } else {
        openmct.objects.addProvider(source.key + "$" + datapoint.name + "$VIS", {
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
            children.push(recurse_fetch_Folder_Datapoint(points, source, source.key + "$" + datapoint.name + "$VIS:" + source.key + "$" + datapoint.name + "$VIS"))
        })
        let comp = []
        children.forEach(child=>{
            if (child.type =="nummeric")
                comp.push(child)
        })
        if (comp.length >=2){
            children.push(add_Stacked_Plot(datapoint,source,source.key + "$" + datapoint.name + "$VIS:" + source.key + "$" + datapoint.name + "$VIS",comp))
            console.log(children);
        }
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                return domainObject.identifier.namespace === source.key + '$' + datapoint.name + '$VIS'
            },
            load: function (domainObject) {
                return Promise.resolve(
                    children
                )
            }
        });
        return {
            namespace: source.key + "$" + datapoint.name + "$VIS",
            key: source.key + "$" + datapoint.name + "$VIS"
        }
    }
}

function add_right_OPMCT_Type_Datapoints(datapoint, source, previous) {
    if (ExternalWebsiteAdapters.includes(datapoint.adapter)) {
        openmct.objects.addProvider(source.key+"$"+datapoint.key + "$VIS",
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
        openmct.objects.addProvider(source.key+"$"+datapoint.key + "$VIS",
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
        openmct.objects.addProvider(source.key+"$"+datapoint.key + "$VIS",
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
    openmct.objects.addProvider(source.key+"$"+datapoint.name + "$Overlay_VIS",
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
    return {
        namespace:source.key + '$'+datapoint.name+ "$Overlay_VIS",
        key:source.name + '$'+ datapoint.name +"$Overlay_Plot"
    }
    
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
            children.push(recurse_fetch_Folder_Datapoint(point,source,source.key+"$VIS:"+source.key))
        })
        let comp = []
        children.forEach(child=>{
            if (child.type =="nummeric")
                comp.push(child)
        })
        if (comp.length >=2){
            children.push(add_Stacked_Plot(source,source,source.key+"$VIS:"+source.key,comp))
        }
        openmct.composition.addProvider({
            appliesTo: function (domainObject) {
                return domainObject.identifier.namespace === source.key + '$VIS' &&
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

