var eqconfig = {};
var host = {};

export default function () {
    return async function install(openmct) {
        
        console.log("WARR_CONN_Plugin:\t Plugin install...");

        getEqConfig();


    }
}

function getEqConfig()
{
    // Get equipment configuration file from webserver
    host = window.location.host;
    //console.log(host);
    $.getJSON('http://' + host + '/eq.json', parseEqConfig);
}

function parseEqConfig(data)
{
    eqconfig = data;
    addConnectionIndicators();
}

function addConnectionIndicators()
{
    // Add a div for all connection indicators
    let header = document.getElementById("WARR_HEADER_INFO");
    let indicator_box = document.createElement('div');
    indicator_box.setAttribute("id", "WARR_HEADER_INFO_CONN");
    indicator_box.setAttribute("class", "w-warrhead__info-conn");
    header.appendChild(indicator_box)
    
    eqconfig.datasources.forEach(source => {
        let indicator = document.createElement('div');
        indicator.setAttribute("id", source.key + '_CONN');
        indicator.setAttribute("class", "w-warrhead__info-conn-ind");
        indicator.innerHTML = source.name;
        indicator_box.appendChild(indicator)
        
    })

    let indicator = document.createElement('div');
        indicator.setAttribute("id", 'PFC' + '_CONN');
        indicator.setAttribute("class", "w-warrhead__info-conn-ind");
        indicator.innerHTML = 'PFC';
        indicator_box.appendChild(indicator)
}