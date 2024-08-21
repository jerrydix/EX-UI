
var Position_OBJ_arr=[];

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

var osmLink = '<a href="http://openstreetmap.org">OpenStreetMap</a>'




let map;
var Radius = 1

let client = {};

var allselect_btn = document.getElementById("select_all");
var allselected = true;

SRC = {}
var sourceport;
let delimiter_arr = [];
let data_sequence = [];
let key = "";
let sockets = []
var iparray = [];
var protocoll = "ws:"
var connected = false;

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
    var WStoserve = SRC.WStoServe;
    var WScount = 0;
    SRC.datapoints.forEach((datapoint,i) => {
      if (datapoint.adapter = "locat1d"){
        WScount +=1;
        if  (WScount == WStoserve){

            delimiter_arr = datapoint.WS.delimiter;
            data_sequence = datapoint.WS.dataorder;
            key = datapoint.key;
        }
      }
    });

    
    sourceport = SRC.destport;
    iparray = SRC.IPtoconnect
    if(SRC.useHTTPS == "True"){
      iparray = []
      iparray.push(window.location.host.split(":")[0])
      protocoll = "wss:"
    }

    

}


function createMap(){
  var host_url = window.location.host.split(":")[0]
  var osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  osmAttrib = '&copy; ' + osmUrl + ' Contributors',
  localUrl = 'https://'+host_url+':8100/styles/basic/{z}/{x}/{y}.png'  
  //localUrl = 'http://'+ sourceip + ':8000' +'/styles/basic/{z}/{x}/{y}.png'
  localAttrib = 'Map that is served by docker';

  var osmMap = L.tileLayer(osmUrl, {attribution: osmAttrib}),
    localMap = L.tileLayer(localUrl, {attribution: localAttrib});

  var baseLayers = {
    "OSM Mapnik": osmMap,
    "Ofline Map": localMap
  };
  map = L.map('map',{layers:[osmMap]}).setView([47.373, 8.540], 5);
  L.control.layers(baseLayers).addTo(map)

}


// For explanaition of socket stuff have a look at plugin.js -> same socket handling exxept here only on socket is handled

function createSocket(){
  iparray.forEach(ip => {
    var SocketPromis = new Promise((resolve, reject) => {
        var socket = new WebSocket(protocoll+"//" +ip+':' + sourceport.toString());
        console.log(socket);
        resolve(socket)  
    });  
    SocketPromis.then((socket) =>{
        console.log(" --- try creating socket to ip: " + ip) 
        let socketobj = createSocketobjekt(socket)
        sockets.push(socketobj)
        var Interval = setInterval(() => {
            recreateSockets(socketobj,Interval)
        }, 4000);
        socket.onopen = function (e){clearInterval(Interval); Eventopen(socketobj)}
        console.log(sockets);
    }).catch( (error) =>{
        console.log(ip+ " error creating socket"+ error);
    })
  });
}

function recreateSockets(socketobj,Interval){
  if (socketobj.socket.readyState != 0){
      var SocketPromis = new Promise((resolve, reject) => {
          resolve(new WebSocket(socketobj.socket.url))    
      });  
      SocketPromis.then((socket) =>{
          console.log(socketobj.socket.url+"- reconnecting");
          socketobj.socket = socket;
          socket.onopen = function (e){clearInterval(Interval); Eventopen(socketobj)}
          console.log(sockets);
      }).catch( (socket) =>{
          console.log(socketobj+ " Failed reconnect") 
      })
  }   
}

function createSocketobjekt(socket){
  let socketobj = {};
  socketobj["socket"] = socket
  socketobj["conne"] = false
  socketobj["inuse"] = false
  socketobj["timeout"] = null;
  return socketobj
}

function EventError(socketobj){

  var socket = socketobj.socket

  socket.onerror = function (msg){
      console.log(socket.url + " ---socket error:"+ msg + " , closing socket and try reconnecting")
      socketobj.inuse = false
      socketobj.conne = false
      socket.close()
  }
  
  socket.onclose = function (msg){
      console.log(socket.url + " ---Websocket closed"+ msg +" try reconnecting")
      socketobj.inuse = false
      socketobj.conne = false 
      useSocket();
      //var Interval = setInterval (recreateSockets(socketobj,key),1000);
      var Interval = setInterval(() => {
          recreateSockets(socketobj,Interval)
      }, 4000);
  }

}

function Eventopen(socketobj){
  socketobj.conne = true
  var socket = socketobj.socket
  console.log(socket.url +" connection open");
  EventError(socketobj)
  var use = false;
  sockets.forEach(socket => {
      if(socket.inuse){
          console.log("found already in use socket")
          use = true
      }
  })
  if(!use){
      socketobj.inuse = true;
      addEvent_messgae(socketobj)
  }
}

function useSocket (){
  console.log(" new already created usable sockets are searched")
  sockets.forEach(socketobj =>{
      if(socketobj.conne){
          socketobj.inuse = true
          console.log(" now using socket"+ socketobj.socket.url)
          addEvent_messgae(socketobj)
          return
      }
  });
}

function addEvent_messgae(socketobj){
  var socket = socketobj.socket;
  var timeout = 100000000; ///XXX maybe set timeout according to timeout specification on eq.json
  socketobj.timeout = window.setTimeout(function(){
      console.log(socket.url +"timeout exided")
      socket.close();
  },timeout)
  socket.onmessage = function (msg) {
      clearTimeout(socketobj.timeout)
      socketobj.timeout = window.setTimeout(function(){
          console.log(socket.url +"timeout exided")
          socket.close();
      },timeout)
      let datapoint = JSON.parse(msg.data);
      parseData(datapoint)
  };
} 





function parseData(data){
  console.log(data);
    if(data.key == key){
        //console.log(data.value);
        var data_string = [];
        data_string.push(data.value);
        for (i in delimiter_arr){
          //console.log(i);
            console.log(data_string);
            for (k in data_string){
                //console.log(data_string[k]);
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
        //console.log(data_string);
        if (Position_OBJ_arr.length-1 >= 0){
          Position_OBJ = Position_OBJ_arr[Position_OBJ_arr.length-1];
        }else{
          Position_OBJ = init_Position_OBJ_test (0,0);
          Position_OBJ_arr.push(Position_OBJ)
        }
        Data_OBJ = new Object();

      z = 0;
      for (i in data_sequence){
        type = data_sequence[i].split(':');
        if(type[0]!='array'){
          switch (type[0]) {
            case 'int':
              Data_OBJ[type[1]] = +(data_string[z]);
              break;
            case 'float':
              Data_OBJ[type[1]] = +(data_string[z]);
              break;
            case 'string':
              Data_OBJ[type[1]] = data_string[z];
              break;
            default:
              break;
          }
        }else {
          var amount = +(type[1]); 
          var curr = z;
          Data_OBJ[type[3]] = [];
          switch (type[2]){
            case 'int':
              for (z; z<curr+amount; z++  ){
                Data_OBJ[type[3]].push(+(data_string[z]));
              }
              break;
            case 'float':
              for (z; z<curr+amount; z++  ){
                Data_OBJ[type[3]].push( +(data_string[z]));
              }
              break;
            case 'string':
              for (z; z<curr+amount; z++  ){
                Data_OBJ[type[3]].push(data_string(z));
              }
              break;
          }
        }
        z += 1;
      }
      console.log(Data_OBJ);
      Position_OBJ.recives.push(Data_OBJ);
      angle = Math.floor(Data_OBJ.degree/10);
      Position_OBJ.angle_arr[angle]=getaverageDataObj(Data_OBJ)
      updatePolis(Position_OBJ)
    }

}

function getaverageDataObj(Data_OBJ){
   data = Data_OBJ.data
   //console.log(data);
   sum = 0
   for (i in data){
    sum += data[i]
   }
   average = sum/data.length
   return average 
}

function updatePositionObjArr(position){
    if (Position_OBJ_arr.length != 0){
      Position_OBJ = Position_OBJ_arr[Position_OBJ_arr.length-1];
    }else{
        Position_OBJ = init_Position_OBJ(position)
        Position_OBJ_arr.push(Position_OBJ)
        updateMapview(position.coords.latitude,position.coords.longitude)
        return
    }
    Long1 = Position_OBJ.Long
    Lat1 = Position_OBJ.Lat
    Lat2 = position.coords.latitude
    Long2 = position.coords.longitude

    //console.log(distance(Long1,Lat1,Long2,Lat2));

    if (distance(Long1,Lat1,Long2,Lat2)>100 ){
      console.log("new destination");
        if(Position_OBJ.recives.length != 0){
            Position_OBJ = init_Position_OBJ(position)
            Position_OBJ_arr.push(Position_OBJ_arr)
            updateMapview(position.coords.latitude,position.coords.longitude)
        }else{
            Position_OBJ.Lat = position.coords.latitude
            Position_OBJ.Long = position.coords.longitude
            updateMapview(position.coords.latitude,position.coords.longitude)
            //Position_OBJ_arr[Position_OBJ_arr.length-1]=Position_OBJ
        }
    }
}

function init_Position_OBJ(position){
  Position_OBJ = new Object()
  Position_OBJ.Lat = position.coords.latitude
  Position_OBJ.Long = position.coords.longitude
  Position_OBJ.recives = []
  Position_OBJ.Poli_arr = []
  Position_OBJ.angle_arr = []
  return Position_OBJ
}

function init_Position_OBJ_test(lat, long){
  Position_OBJ = new Object()
  Position_OBJ.Lat = lat
  Position_OBJ.Long = long
  Position_OBJ.recives = []
  Position_OBJ.Poli_arr = []
  Position_OBJ.angle_arr = []
  return Position_OBJ
}

function errorPos(){
  console.log("GPS positioning is not available on your device");
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

function toRadians(cood){
    cood = +(cood)
    deg = 180/Math.PI
    return (deg*cood)
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
    PoliHandle(allselected);
  });

  navigator.geolocation.watchPosition(updatePositionObjArr,errorPos,options);


}

function updateMapview(lat,long){
  map.setView([lat,long],15)
  addMarker(lat,long,'test')

}
function addMarker(lat,long,text){
  var marker = L.marker([lat, long],{icon:USER}).bindPopup(text)
  .openPopup().addTo(map);
  Position_OBJ_arr[Position_OBJ_arr.length-1].Marker = marker
}

function arrayMin(arr) {
  var len = arr.length, min = Infinity;
  while (len--) {
    if (arr[len] < min) {
      min = arr[len];
    }
  }
  return min;
};

function arrayMax(arr) {
  var len = arr.length, max = -Infinity;
  while (len--) {
    if (arr[len] > max) {
      max = arr[len];
    }
  }
  return max;
};

function updatePolis(Position_OBJ){
  lat = Position_OBJ.Lat
  long = Position_OBJ.Long
  maxdb = arrayMax(Position_OBJ.angle_arr)
  mindb = arrayMin(Position_OBJ.angle_arr)
  console.log(mindb+ " " + maxdb);
  for (i in Position_OBJ.angle_arr){
    if (Position_OBJ.angle_arr[i]){
      if (Position_OBJ.Poli_arr[i]){
        Position_OBJ.Poli_arr[i].remove();
      }
      var corr_color = d3.scaleLinear().domain([mindb, (mindb+maxdb)/2, maxdb]).range(["#3399FF", "#FFFFF0", "#FF6600"]);
      console.log(corr_color);
      Position_OBJ.Poli_arr[i] = calc_Poli([lat,long],i*10,10,corr_color(Position_OBJ.angle_arr[i])) 
    }
  }
  draw_polis(Position_OBJ.Poli_arr)
}

function draw_polis(Poli_arr){
  for (i in Poli_arr){
      Poli_arr[i].addTo(map);
  }
}

function calc_Poli(position, direction, step, strength){
  var direction1 = direction * Math.PI / 180;
  var direction2 = (direction+step) * Math.PI / 180 
  var pos1 = position[0]+(Radius*Math.cos(direction1));
  var pos2 = position[1]+(Radius*Math.sin(direction1));
  var pos3 = position[0]+(Radius*Math.cos(direction2));
  var pos4 = position[1]+(Radius*Math.sin(direction2));
  var pos5 = position[0];
  var pos6 = position[1];
  var Poli = L.polygon([
      [pos1,pos2],
      [pos3,pos4],
      [pos5,pos6]
  ],
  {
      fillColor: strength,
      color: strength, 
      fillOpacity: 0.5 
  });

  return Poli;
}

function delete_Polis(Position_OBJ){
  for (i in Position_OBJ.Poli_arr){
    if (Position_OBJ.Poli_arr[i]){
      Position_OBJ.Poli_arr[i].remove();
    }
  }
}

function PoliHandle(all){
  for (i in Position_OBJ_arr){
    if(all){
      updatePolis(Position_OBJ_arr[i])
    }else{
      delete_Polis(Position_OBJ_arr[i])
    }
  }
  updatePolis(Position_OBJ_arr[Position_OBJ_arr.length-1])

}





async function main(){
    await getData('./eq.json');
    setParameters();
    createMap();
    createSocket();
    createMapevents();

}
main();
