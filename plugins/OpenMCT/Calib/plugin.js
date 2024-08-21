define([
    './CalibViewProvider',
    
], function (
    CalibViewProvider,

) {
    return function plugin() {


        return function install(openmct) {
            openmct.objectViews.addProvider(new CalibViewProvider(openmct));

            openmct.types.addType('CalibrationTable', {
                name: "Calibration Table",
                description: "This allows to create and edit sensor calibrations",
                creatable: true,
                cssClass: 'icon-columns',
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
                    domainObject.Calibs = []
                }
            });
        };
    };
});

function getDatapointsRecursive(config, allSensors) {
    for (i of config) {
        if (i.type == "folder") {
            getDatapointsRecursive(i.values, allSensors)
        } else {
            allSensors.push(i);
        }
    }
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
            if ("datapoints" in source && "Calibrations" in source) {
                let allDatapoints = []
                getDatapointsRecursive(source.datapoints, allDatapoints)
                let datapointsWithCalibrations = allDatapoints.filter(datapoint => source.Calibrations.filter(calib => calib.key === datapoint.key).length > 0)
                options.push({ value: [source, datapointsWithCalibrations], name: source.name })
            }
        } catch (error) {
            console.log('error adding calibration data sources: ', error); 
        }
    })
    return options
}

