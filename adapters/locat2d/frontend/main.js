
var allselect_btn = document.getElementById("select_all");
var allselected = allselect_btn.checked;



SRC = {}
var WebsocketPort = 9100
var timeouttime = 1500
var timeout
var timeoutRetries
var MaxRetries = 5
var WS

let map;
var osmLink = '<a href="http://openstreetmap.org">OpenStreetMap</a>'

var pluginName = "locat2d"




var Location_arr = [];

var Rocket = L.icon({
    iconUrl: './images/Rocket_loc.png',
   // shadowUrl: 'leaf-shadow.png',
   iconSize:     [48, 48], // size of the icon
   //shadowSize:   [50, 64], // size of the shadow
   iconAnchor:   [24, 24], // point of the icon which will correspond to marker's location
   //shadowAnchor: [4, 62],  // the same for the shadow
   popupAnchor:  [0, 0] // point from which the popup should open relative to the iconAnchor
});

var USER = L.icon({
    iconUrl: './images/Arrow_loc.png',
    //shadowUrl: 'leaf-shadow.png',
    iconSize:     [48, 48], // size of the icon
    //shadowSize:   [50, 64], // size of the shadow
    iconAnchor:   [24, 24], // point of the icon which will correspond to marker's location
    //shadowAnchor: [4, 62],  // the same for the shadow
    popupAnchor:  [0, 0] // point from which the popup should open relative to the iconAnchor
});

var Home = L.icon({
    iconUrl: './images/Home.png',
    //shadowUrl: 'leaf-shadow.png',
    iconSize:     [48, 48], // size of the icon
    //shadowSize:   [50, 64], // size of the shadow
    iconAnchor:   [24, 24], // point of the icon which will correspond to marker's location
    //shadowAnchor: [4, 62],  // the same for the shadow
    popupAnchor:  [0, 0] // point from which the popup should open relative to the iconAnchor
});

let client = {};
var connected = false;

var sourceport;
let delimiter_arr = [];
let data_sequence = [];
let key = "";
let sockets = []
var iparray = [];
var protocoll = "ws:"

async function getData(url) {
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      console.log(data);
      SRC = data;
    } catch (error) {
      // Error handling here
      console.log(error);
    }
}

function setParameters(){
    var GPStoserve = SRC.GPStoServe;
    var GPScount = 0;
    SRC.datapoints.forEach((datapoint,i) => {
        if (datapoint.adapter == "locat2d"){
            GPScount +=1;
            if  (GPScount == GPStoserve){
                console.log(datapoint);

                delimiter_arr = datapoint.GPS.delimiter;
                data_sequence = datapoint.GPS.dataorder;
                key = SRC.key+'$'+datapoint.key;
                LaunchSite = datapoint.LaunchSite
            }
        }
    });
    sourceport = SRC.destport
    iparray = SRC.IPtoconnect
    if(SRC.useHTTPS == "True"){
      iparray = []
      iparray.push(window.location.host.split(":")[0])
      protocoll = "wss:"
    }

}


function createMap(){
        var host_url = window.location.host.split(':')[0]
        console.log(host_url);
    var osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        osmAttrib = '&copy; ' + osmUrl + ' Contributors',
        localUrl = 'https://'+host_url+ ':8100/styles/basic/{z}/{x}/{y}.png'
        //localUrl = 'http://'+ sourceip + ':8000' +'/styles/basic/{z}/{x}/{y}.png'
        localAttrib = 'Map that is served by docker';

    var osmMap = L.tileLayer(osmUrl, {attribution: osmAttrib}),
        localMap = L.tileLayer(localUrl, {attribution: localAttrib});

    var baseLayers = {
        "OSM Mapnik": osmMap,
        "Ofline Map": localMap
    };
    console.log(LaunchSite);
    try {
        map = L.map('map', {layers:[osmMap]}).setView(LaunchSite, 13);
    } catch (error) {
        console.log(error);
        map = L.map('map', {layers:[osmMap]}).setView([48,8], 8);
    }
    
    
    //L.tileLayer('http://localhost:8080/styles/basic/{z}/{x}/{y}.png').addTo(map);



   /*  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map); */
    L.control.layers(baseLayers).addTo(map)

}

// For explanaition of socket stuff have a look at plugin.js -> same socket handling exxept here only on socket is handled

function createSocket(){
    var ip = iparray[(Math.random() * iparray.length) | 0]
    WS = new WebSocket(protocoll+'//'+ip+':'+WebsocketPort)
    WSEvents() 
}

function WSEvents(){
    WS.onerror = function (msg){
        console.log("[" + pluginName + "]"+ WS.url + " ---socket error: "+ msg + " , closing socket and try reconnecting")
        WS.close()
    }
    WS.onclose = function (msg){
        console.log("[" + pluginName + "]"+ WS.url + " ---Websocket closed:" + msg +" try reconnecting")
        createSocket()
    }
    WS.onopen = function (msg){
        addEvent_messgae()
        console.log("[" + pluginName + "]"+ WS.url + " ---Websocket opend: "+ msg)
        createSocketTimeout()
    }
    
}
  
function createSocketTimeout(){
    timeout = setTimeout(async ()=>{
        timeoutRetries++
        console.log("[" + pluginName + "]"+ WS.url + " ---Websocket TimedOut:")
        if (timeoutRetries >= MaxRetries){
            timeoutRetries = 0
            WS.close()
        }
    },timeouttime)
}

  
function addEvent_messgae(socketobj){

WS.onmessage = function (msg) {
    clearTimeout(timeout)
    timeoutRetries = 0
    createSocketTimeout()
    let datapoint = JSON.parse(msg.data);
    if(!datapoint.type.includes("RequestResponse") && datapoint.data[0].key)
        parseData(datapoint.data[0])
    };
} 



function createMapevents(){

    var options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    };
  
    allselect_btn.addEventListener("change", function(e){
      allselected = allselect_btn.checked;
      console.log(allselected);
      update_Marker(Location_arr,allselected)
    });
  
    navigator.geolocation.watchPosition(updatePosition,errorPos,options);
  
  
}



function errorPos(){
    console.log("GPS positioning is not available on your device");
}

function updatePosition(pos){
    if (!client.lat){
        console.log("creating")
        client = new Object();
    }else{
        client.marker.remove()
    }
    console.log('updating client pos');
    client.lat = pos.coords.latitude
    client.long = pos.coords.longitude
    Marker = new Object()
        Marker.text = "This is your current location"
        Marker.icon = USER
    client.marker = addMarker(client.long,client.lat,Marker);
}

function distance (Long1, Lat1, Long2, Lat2){

    const R = 6371e3; // metres
    const φ1 = Lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = Lat2 * Math.PI/180;
    const Δφ = (Lat2-Lat1) * Math.PI/180;
    const Δλ = (Long2-Long1) * Math.PI/180;
  
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
    const d = R * c; // in metres
    return d
      
      
}

function parseData(data){
    let datatype = data.key;
    if(datatype == key ){
        console.log(data.value);
        var data_string = [];
        data_string.push(data.value);
        for (i in delimiter_arr){
            //console.log(data_string);
            for (k in data_string){
                data_string_buff = [];
                data_string_split = data_string[k].split(delimiter_arr[i]);
                //console.log("String split "+ k +' ' +data_string_split);
                for (t in data_string){
                    if (t != k)
                        data_string_buff.push(data_string[t]);
                    else{
                        for (s in data_string_split){
                            if(data_string_split[s]!= '')
                                data_string_buff.push(data_string_split[s]);
                        }
                    }
                }
                data_string = data_string_buff;
            }
        }
        console.log(data_string);
    
        Location = new Object();
        for (i in data_sequence){
            Location[data_sequence[i]] = +(data_string[i])
        }

        
        if(SRC.NEMA){
            cood = Location.long 
            temp = parseInt(cood/100);
            Location.long = (cood-temp*100+temp*60)/60.0
            
            cood = Location.lat
            temp = parseInt(cood/100);
            Location.lat = (cood-temp*100+temp*60)/60.0
        }

        if (data.value.includes('S'))
            Location.lat = Location.lat * -1;

        if (data.value.includes('W'))
            Location.long = Location.long * -1;

        console.log(Location);
        Marker = new Object()
        Marker.text = "This is the location of the rocket"
        Marker.icon = Rocket
        Location.marker = addMarker(Location.long,Location.lat, Marker)
        Location_arr.push(Location);
        if(!allselected && Location_arr.length >= 2){
            deletMarker(Location_arr[Location_arr.length-2].marker)
        }
        
    }
}


function deletMarker(marker){
    marker.remove()
}

function deletallMarkers(Marker){
    for (i in Marker)
    Marker[i].remove();
}

function addMarker(long, lat, objekt){
    var marker = L.marker([lat,long],{icon: objekt.icon}).bindPopup(objekt.text)
    .openPopup().addTo(map);
    return marker;
}

function update_Marker(arr,all){
    for (i in arr){
        arr[i].marker.remove();
        if(all){
            arr[i].marker.addTo(map);
        }
    }
    if (!all){
        arr[arr.length-1].marker.addTo(map);
    }
}

async function main(){
    await getData('./eq.json');
    setParameters();
    createMap();
    createSocket();
    createMapevents();
    try {
        L.marker(LaunchSite,{icon:Home}).addTo(map)
    } catch (error) {
        console.log(error);
        console.log("no Launsite Coods Found");
    }
    

}
main();
