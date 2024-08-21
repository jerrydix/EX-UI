define([
    '../flexibleLayout/flexibleLayoutViewProvider',
    '../flexibleLayout/utils/container',
    '../flexibleLayout/toolbarProvider',
    './ButtonViewProvider',
    './ButtonViewV2Provider',
    './OPCToggleButtonViewProvider',
    './ControllTableViewProvider',
    './ControllTableViewV2Provider',
    './FluidPlanViewProvider',
    './StringControllViewProvider',
], function (
    FlexibleLayoutViewProvider,
    Container,
    ToolBarProvider,
    ButtonViewProvider,
    ButtonViewV2Provider,
    OPCToggleButtonViewProvider,
    ControllTableViewProvider,
    ControllTableViewV2Provider,
    FluidPlanViewProvider,
    StringControllViewProvider,
) {
    return function plugin() {
        return function install(openmct) {
            openmct.objectViews.addProvider(new ButtonViewProvider(openmct));
            openmct.types.addType('ControllButton', {
                name: "Controll Button",
                description: "This allows to creat an Button to controll corresponding outputs",
                creatable: true,
                cssClass: 'icon-circle',
                form: [
                    {
                        "key": "command",
                        "name": "Comand",
                        "control": "textfield",
                        "required": true,
                        "cssClass": "l-input-lg"
                    },
                    /* ,
                    {
                        "key": "reset",
                        "name": "Reset On Send",
                        "control": "toggleSwitch",
                        "required": true,
                        "cssClass": "l-input-lg"
                    } */
                ],
                initialize: function (domainObject) {
                    domainObject.state = false
                    domainObject.transition = 0
                }
            });

            openmct.objectViews.addProvider(new ButtonViewV2Provider(openmct));
            openmct.types.addType('ControllButtonV2', {
                name: "Controll Button V2",
                description: "This allows to creat an Button to controll corresponding outputs",
                creatable: true,
                cssClass: 'icon-circle',
                form: [
                    {
                        "key": "command",
                        "name": "Comand",
                        "control": "textfield",
                        "required": true,
                        "cssClass": "l-input-lg"
                    },
                    /* ,
                    {
                        "key": "reset",
                        "name": "Reset On Send",
                        "control": "toggleSwitch",
                        "required": true,
                        "cssClass": "l-input-lg"
                    } */
                ],
                initialize: function (domainObject) {
                    domainObject.state = false
                    domainObject.transition = 0
                }
            });

            openmct.objectViews.addProvider(new OPCToggleButtonViewProvider(openmct));
            openmct.types.addType('OPCToggleButton', {
                name: "OPC Toggle Button",
                description: "Toggles an OPC-UA node on click to trigger events on the MCS",
                creatable: true,
                cssClass: 'icon-circle',
                form: [
                ],
                initialize: function (domainObject) {
                    domainObject.state = false
                    domainObject.transition = 0
                }
            });
            
            openmct.objectViews.addProvider(new StringControllViewProvider(openmct));
            openmct.types.addType('StringControll', {
                name: "String controll",
                description: "This allows to creat an inputfield to controll corresponding outputs",
                creatable: true,
                cssClass: 'icon-circle',
                form: [
                    {
                        "key": "command",
                        "name": "Command",
                        "control": "textfield",
                        "required": true,
                        "cssClass": "l-input-lg",
                    },
                    {
                        "key": "inputtype",
                        "name": "Inputype",
                        "control": "select",
                        "required": true,
                        "cssClass": "l-input-lg",
                        "options": [
                            {
                                value:"number",
                                name:"number-text"
                            },
                            {
                                value:"text",
                                name:"text"
                            },
                            {
                                value:"range",
                                name:"number-slider"
                            },
                        ]
                    },
                    {
                        "key": "max",
                        "name": "Length of input ",
                        "control": "numberfield",
                        "required": false,
                        "cssClass": "l-input-sm l-numeric"
                    },
                    {
                        "key": "min",
                        "name": "min Length of input",
                        "control": "numberfield",
                        "required": false,
                        "cssClass": "l-input-sm l-numeric"
                    },
                    {
                        "key": "range",
                        "name": "range",
                        "control": "numberfield",
                        "required": false,
                        "cssClass": "l-input-sm l-numeric"
                    }
                ],
                initialize: function (domainObject) {
                        domainObject.state = 1
                        domainObject.transition = ""
                }
            }); 


            
            openmct.objectViews.addProvider(new ControllTableViewProvider(openmct));
            openmct.types.addType('ControllTable', {
                name: "Controll Table",
                description: "This allows to creat an Button to controll corresponding outputs",
                creatable: true,
                cssClass: 'icon-table',
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
                    domainObject.configuration = {
                        containers: [new Container.default(50), new Container.default(50)],
                        rowsLayout: false
                    };
                    domainObject.paswd = "",
                    domainObject.composition = [];
                }
            });

            openmct.objectViews.addProvider(new ControllTableViewV2Provider(openmct));
            openmct.types.addType('ControllTableV2', {
                name: "Controll Table V2",
                description: "This allows to creat an Button to controll corresponding outputs",
                creatable: true,
                cssClass: 'icon-table',
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
                    domainObject.configuration = {
                        containers: [new Container.default(50), new Container.default(50)],
                        rowsLayout: false
                    };
                    domainObject.paswd = "",
                    domainObject.composition = [];
                }
            });

            openmct.objectViews.addProvider(new FluidPlanViewProvider(openmct));
            openmct.types.addType('FluidPlan', {
                name: "Fluid Plan",
                description: "Interactive fluid plan for controlling and monitoring valves",
                creatable: true,
                cssClass: 'icon-circle',
                form: [],
                initialize: function (domainObject) {
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
    var options = []
    eqconfig.datasources.forEach(source=>{
        if(source.pswd && source.pswd!= "")
            options.push({value:source.commandport,name:source.name})
    })
    options.push({value:10000,name:"test"})
    options.push({value:10100,name:"opcua"})
    options.push({value:9100,name:"opcua-temp"})
    return options
}
