define([
    './SequenceViewProvider',
    
], function (
    SequenceViewProvider,

) {
    return function plugin() {


        return function install(openmct) {
            openmct.objectViews.addProvider(new SequenceViewProvider(openmct));

            openmct.types.addType('SequenceTable', {
                name: "Sequence Table",
                description: "This allows to creat and edit Sequences",
                creatable: true,
                cssClass: 'icon-tabular',
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
                    domainObject.Sequence = []
                }
            });
        };
    };
});


function getInputsRecursive(config, inputs) {
    for (i of config) {
        if (i.type == "folder") {
            getInputsRecursive(i.values, inputs)
        } else {
            inputs.push(i);
        }
    }
}

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
    eqconfig.datasources.forEach(source=>{
        try {
            if('Controlls' in source &&
                    'Sequences' in source &&
                    'Inputs' in source['Controlls'] && 
                    'datapoints' in source && 
                    'Redlines' in source &&
                    'Igniters' in source) {
                let inputs = [];

                let allDatapoints = [];
                getDatapointsRecursive(source.datapoints, allDatapoints);
                let datapointsWithRedlines = allDatapoints.filter(datapoint => source.Redlines.filter(redline => redline.key === datapoint.key).length > 0);

                let firstRedlineSequence = source.Sequences.find(s => s.type === "redline");
                let redlineSequenceAmount = firstRedlineSequence ? firstRedlineSequence.amount : 0;
                let redlineSequenceNumbers = [];

                let igniters = source.Igniters;

                igniters = igniters.map(igniter => { delete igniter["opcua"]; return igniter })

                getInputsRecursive(source.Controlls.Inputs, inputs);
                for (const sequence of source.Sequences) {
                    if (sequence['type'] === 'redline_trigger_sequence') {
                        continue;
                    }
                    if (sequence.type === 'primary') {
                        for (let i = 0; i < redlineSequenceAmount; i++) {
                            redlineSequenceNumbers.push(i);
                        }
                    } else {
                        igniters = [];
                        redlineSequenceNumbers = [];
                    }

                    for (let i = 0; i < sequence.amount; i++) {
                        let actualSequence = JSON.parse(JSON.stringify(sequence));
                        if (sequence.amount > 1) {
                            actualSequence['key'] = sequence.type + i;
                            actualSequence['name'] = sequence['name'] + ' ' + (i + 1);
                        } else {
                            actualSequence['key'] = sequence.type;
                        }
                        console.log("actual sequence",actualSequence)
                        options.push({ value: [source, actualSequence, inputs, datapointsWithRedlines, redlineSequenceNumbers, igniters], name: source.name + "/" + actualSequence.name })
                    }
                }
            }
        } catch (error) {
           console.log('error adding sequence data sources: ', error); 
        }
    })

    console.log("OPTIONS")
    console.log(options)
    //options.push({value:10000,name:"test"})
    return options
}

