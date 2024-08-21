import * as THREE from './js/three.module.js';
import { OBJLoader } from './js/OBJLoader.js';
import { GLTFLoader } from './js/GLTFLoader.js'

var camera, scene, renderer, model;
var geometry, material, mesh;

let SRC = {}

var WebsocketPort = 9100
var timeouttime = 1500
var timeout
var timeoutRetries
var MaxRetries = 5
var WS

var pluginName = "orient3d"

var sourceport;
let delimiter_arr = [];
let data_sequence = [];
let key = "";
let sockets = []
var iparray = [];
var protocoll = "ws:"
var connected = false;

async function main(){
    await getData('./eq.json');
    setParameters();
    createSocket();
    //init()
    init_starship();
    animate();
}

main()

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
      if (datapoint.adapter == "orient3d"){
        WScount +=1;
        if  (WScount == WStoserve){
            console.log(datapoint)
            delimiter_arr = datapoint.WS.delimiter;
            data_sequence = datapoint.WS.dataorder;
            key = SRC.key+"$"+datapoint.key;
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

  function parseData(data){
    console.log(data);
      if(data.key == key){
          console.log(data.value);
          var data_string = [];
          var data_string_buff = [];
          var data_string_split = [];
          data_string.push(data.value);
          var i,k,t,s
          for (i in delimiter_arr){
            console.log(i);
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
        
        var  Data_OBJ = new Object();
  
        var z = 0;
        for (i in data_sequence){
          var type = data_sequence[i].split(':');
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
        var targetQuaternion = new THREE.Quaternion(Data_OBJ.quat_y, Data_OBJ.quat_z, Data_OBJ.quat_x, Data_OBJ.quat_w);  //XX future adapt order of quaternian data automaticly or      
        model.quaternion.slerp(targetQuaternion, 1);
      }
  
}

function init() 
{
    const loader = new GLTFLoader();
    
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 2000);
    camera.position.z = 21.426;
    camera.position.x = -31.652;
    camera.position.y = 1.6
    camera.rotation.y = - Math.PI / 3
    
    scene = new THREE.Scene();
    const bgcolor = new THREE.Color(0x6bb6bc);
    bgcolor.convertSRGBToLinear();
    scene.background = bgcolor;
    const fogcolor = new THREE.Color(0xe6e6e6)
    fogcolor.convertSRGBToLinear();
    scene.fog = new THREE.Fog(fogcolor, 0.01, 110);

    loader.load( './3D/scene.gltf', function ( gltf ) {

        gltf.scene.scale.set(100, 100, 100); 
        scene.add( gltf.scene );
        
    
    }, undefined, function ( error ) {
    
        console.error( error );
    
    } );
 
    const lightcolor = new THREE.Color(0xffdd99);
    lightcolor.convertSRGBToLinear();
    let direcLight = new THREE.DirectionalLight(lightcolor, 2);
    direcLight.position.set(-80,2,25)
    scene.add(direcLight);
    
    geometry = new THREE.BoxGeometry(0.5, 3, 0.5);
    material = new THREE.MeshNormalMaterial();

    mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(-25,1.6,15)
    scene.add(mesh);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.gammaFactor = 2.2;
    renderer.outputEncoding = THREE.sRGBEncoding;
    //renderer.physicallyCorrectLights = true;
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    document.body.appendChild(renderer.domElement);
}

function animate() 
{
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

function init_starship() 
{
    const loader = new GLTFLoader();
    
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.z = 17.54;
    camera.up.set(0,1,1)
    // camera.position.x = -31.652;
    // camera.position.y = 1.6
    // camera.rotation.y = - Math.PI / 3
    
    scene = new THREE.Scene();
    // const bgcolor = new THREE.Color(0x6bb6bc);
    // bgcolor.convertSRGBToLinear();
    // scene.background = bgcolor;

    const skyboxImage = 'space';
    const materialArray = createMaterialArray(skyboxImage);
    const skyboxGeo = new THREE.BoxGeometry(10000, 10000, 10000);
    const skybox = new THREE.Mesh(skyboxGeo, materialArray);
    scene.add(skybox);




    // const fogcolor = new THREE.Color(0xe6e6e6)
    // fogcolor.convertSRGBToLinear();
    //scene.fog = new THREE.Fog(fogcolor, 0.01, 110);

    // loader.load( './3D/terrain/scene.gltf', function ( gltf ) {

    //     gltf.scene.scale.set(100, 100, 100); 
    //     scene.add( gltf.scene );
        
    
    // }, undefined, function ( error ) {
    
    //     console.error( error );
    
    // } );
 
    const lightcolor = new THREE.Color(0xffffff);
    lightcolor.convertSRGBToLinear();
    let direcLight = new THREE.DirectionalLight(lightcolor, 2.5);
    direcLight.position.set(-80,2,25)
    scene.add(direcLight);
    
    // geometry = new THREE.BoxGeometry(0.5, 3, 0.5);
    // material = new THREE.MeshNormalMaterial();

    // mesh = new THREE.Mesh(geometry, material);
    // mesh.position.set(-25,1.6,15)
    loader.load( './3D/EX3/EX3.glb', function ( gltf ) {
    //loader.load( './3D/starship/starship.glb', function ( gltf ) {

        model = gltf.scene
        //model.scale.set(0.05, 0.05, 0.05); //starship2
        model.scale.set(2, 2, 2); //starship
        model.position.set(0,0,0)
        //model.rotation.z = -Math.PI/2
        scene.add( model );
        
    
    }, undefined, function ( error ) {
    
        console.error( error );
    
    } );
    //scene.add(mesh);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.gammaFactor = 2.2;
    renderer.outputEncoding = THREE.sRGBEncoding;
    //renderer.physicallyCorrectLights = true;
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    document.body.appendChild(renderer.domElement);

    //const controls = new OrbitControls( camera, renderer.domElement );
}

function createPathStrings(filename) {

  const basePath = "./";

  const baseFilename = basePath + filename;

  const fileType = ".png";

  const sides = ["ft", "bk", "up", "dn", "rt", "lf"];

  const pathStings = sides.map(side => {

      return baseFilename + "_" + side + fileType;

  });

  return pathStings;
}

function createMaterialArray(filename) {

  const skyboxImagepaths = createPathStrings(filename);
  
  const materialArray = skyboxImagepaths.map(image => {
  
      let texture = new THREE.TextureLoader().load(image);
  
  
      return new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide }); // <---
  
  });
  
  return materialArray;
  
}
