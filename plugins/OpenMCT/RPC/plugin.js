define([
    './RPCViewProvider',
    
], function (
    RPCViewProvider,

) {
    return function plugin() {


        return function install(openmct) {
            openmct.objectViews.addProvider(new RPCViewProvider(openmct));

            openmct.types.addType('RPC', {
                name: "RPC Interface",
                description: "This allows to control the RPC system interface.",
                creatable: true,
                cssClass: 'icon-gauge',
                form: [
                    {
                        "key": "adapter",
                        "name": "Port",
                        "control": "select",
                        "required": true,
                        "cssClass": "l-input-lg",
                        "options": getEqConfig()
                    }
                ],
                initialize: function (domainObject) {
                    domainObject.paswd = ""
                }
            });
        };
    };
});



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
            //console.log("Successfully fetched equipment config.")
        }
        else {
            //consolee.error("ERROR fetching equipment configuration: " + xhr.status);
        }
    };
    xhr.send();
    console.log('getEqConfig')
    console.log(eqconfig)
    var options = []
    eqconfig.datasources.forEach(source => {  
        try {
            if (source["name"] == "RPC" && "datapoints" in source && "Controlls" in source) {
                                
                for (let datapoint of source.datapoints) {
                    let controlArr = []
                    for (let value of datapoint.values) {
                        for (let control of source.Controlls.Inputs) {
                            if (control.key == value.key) {
                                controlArr.push(control)
                            }
                        }
                    }
                    options.push({ value: [source, datapoint, controlArr], name: source.name + "/" + datapoint.name })
                }
            }
        } catch (error) {
            console.log('error adding RPC data sources: ', error); 
        }
    })
    return options
}

