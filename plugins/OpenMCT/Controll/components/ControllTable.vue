/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2022, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

<template>
    <div class="C-Table_wrap">
        <div class="Paswd_wrap">
                <h1>Password:</h1>
                <input type="Password" @change="openmct.objects.mutate(domainObject,'paswd',pswd)" v-model="pswd">
        </div>
        <div class="c-fl_wrap">
            <div class="c-fl">
                <div
                    id="js-fl-drag-ghost"
                    class="c-fl__drag-ghost"
                ></div>

                <div
                    v-if="allContainersAreEmpty"
                    class="c-fl__empty"
                >
                    <span class="c-fl__empty-message">This Flexible Layout is currently empty</span>
                </div>

                <div
                    class="c-fl__container-holder"
                    :class="{
                        'c-fl--rows': rowsLayout === true
                    }"
                >
                    <template v-for="(container, index) in containers">
                        <drop-hint
                            v-if="index === 0 && containers.length > 1"
                            :key="`hint-top-${container.id}`"
                            class="c-fl-frame__drop-hint"
                            :index="-1"
                            :allow-drop="allowContainerDrop"
                            @object-drop-to="moveContainer"
                        />

                        <container-component
                            :key="`component-${container.id}`"
                            class="c-fl__container"
                            :index="index"
                            :container="container"
                            :rows-layout="rowsLayout"
                            :is-editing="isEditing"
                            :locked="domainObject.locked"
                            :object-path="objectPath"
                            @move-frame="moveFrame"
                            @new-frame="setFrameLocation"
                            @persist="persist"
                        />

                        <resize-handle
                            v-if="index !== (containers.length - 1)"
                            :key="`handle-${container.id}`"
                            :index="index"
                            :orientation="rowsLayout ? 'vertical' : 'horizontal'"
                            :is-editing="isEditing"
                            @init-move="startContainerResizing"
                            @move="containerResizing"
                            @end-move="endContainerResizing"
                        />

                        <drop-hint
                            v-if="containers.length > 1"
                            :key="`hint-bottom-${container.id}`"
                            class="c-fl-frame__drop-hint"
                            :index="index"
                            :allow-drop="allowContainerDrop"
                            @object-drop-to="moveContainer"
                        />
                    </template>
                </div>
            </div>
        </div>
        <div class="Button-wrap">
            <button class="ControllButton" :id= "pswd==''? 'SendButtonRed' :'SendButton'" @click="handleClick()"  type="button">SEND</button>
        </div>
    </div>
</template>

<script>
import ContainerComponent from '../../flexibleLayout/components/container.vue';
import Container from '../../flexibleLayout/utils/container';
import Frame from '../../flexibleLayout/utils/frame';
import ResizeHandle from '../../flexibleLayout/components/resizeHandle.vue';
import DropHint from '../../flexibleLayout/components/dropHint.vue';



const MIN_CONTAINER_SIZE = 12;
var Socket
const timeout =30000;



// Resize items so that newItem fits proportionally (newItem must be an element
// of items).  If newItem does not have a size or is sized at 100%, newItem will
// have size set to 1/n * 100, where n is the total number of items.
function sizeItems(items, newItem) {
    if (items.length === 1) {
        newItem.size = 100;
    } else {
        if (!newItem.size || newItem.size === 100) {
            newItem.size = Math.round(100 / items.length);
        }

        let oldItems = items.filter(item => item !== newItem);
        // Resize oldItems to fit inside remaining space;
        let remainder = 100 - newItem.size;
        oldItems.forEach((item) => {
            item.size = Math.round(item.size * remainder / 100);
        });
        // Ensure items add up to 100 in case of rounding error.
        let total = items.reduce((t, item) => t + item.size, 0);
        let excess = Math.round(100 - total);
        oldItems[oldItems.length - 1].size += excess;
    }
}

// Scales items proportionally so total is equal to 100.  Assumes that an item
// was removed from array.
function sizeToFill(items) {
    if (items.length === 0) {
        return;
    }

    let oldTotal = items.reduce((total, item) => total + item.size, 0);
    items.forEach((item) => {
        item.size = Math.round(item.size * 100 / oldTotal);
    });
    // Ensure items add up to 100 in case of rounding error.
    let total = items.reduce((t, item) => t + item.size, 0);
    let excess = Math.round(100 - total);
    items[items.length - 1].size += excess;
}

export default {
    components: {
        ContainerComponent,
        ResizeHandle,
        DropHint
    },
    inject: ['openmct', 'objectPath', 'ControllTable'],
    props: {
        isEditing: Boolean
    },
    data() {
        return {
            domainObject: this.ControllTable,
            newFrameLocation: [],
            identifierMap: {},
            SocketPort : this.ControllTable.adapter,
            pswd : this.ControllTable.paswd,
            Name: this.ControllTable.name
        };
    },
    computed: {
        layoutDirectionStr() {
            if (this.rowsLayout) {
                return 'Rows';
            } else {
                return 'Columns';
            }
        },
        containers() {
            return this.domainObject.configuration.containers;
        },
        rowsLayout() {
            return this.domainObject.configuration.rowsLayout;
        },
        allContainersAreEmpty() {
            return this.containers.every(container => container.frames.length === 0);
        }
    },
    mounted() {
        this.buildIdentifierMap();
        //this.generating_IpArr();
        this.composition = this.openmct.composition.get(this.domainObject);
        this.composition.on('remove', this.removeChildObject);
        this.composition.on('add', this.addFrame);
        this.composition.load();
        //this.createWebsockets();
        this.createSocket();
        
    },
    beforeDestroy() {
        this.composition.off('remove', this.removeChildObject);
        this.composition.off('add', this.addFrame);
    },
    methods: {
        buildIdentifierMap() {
            console.log(this.containers);
            this.containers.forEach(container => {
                container.frames.forEach(frame => {
                    let keystring = this.openmct.objects.makeKeyString(frame.domainObjectIdentifier);
                    this.identifierMap[keystring] = true;
                });
            });
        },
        addContainer() {
            let container = new Container();
            this.containers.push(container);
            sizeItems(this.containers, container);
            this.persist();
        },
        deleteContainer(containerId) {
            let container = this.containers.filter(c => c.id === containerId)[0];
            let containerIndex = this.containers.indexOf(container);

            /*
                remove associated domainObjects from composition
            */
            container.frames.forEach(f => {
                this.removeFromComposition(f.domainObjectIdentifier);
            });

            this.containers.splice(containerIndex, 1);

            /*
                add a container when there are no containers in the FL,
                to prevent user from not being able to add a frame via
                drag and drop.
            */
            if (this.containers.length === 0) {
                this.containers.push(new Container(100));
            }

            sizeToFill(this.containers);
            this.setSelectionToParent();
            this.persist();
        },
        moveFrame(toContainerIndex, toFrameIndex, frameId, fromContainerIndex) {
            let toContainer = this.containers[toContainerIndex];
            let fromContainer = this.containers[fromContainerIndex];
            let frame = fromContainer.frames.filter(f => f.id === frameId)[0];
            let fromIndex = fromContainer.frames.indexOf(frame);
            fromContainer.frames.splice(fromIndex, 1);
            sizeToFill(fromContainer.frames);
            toContainer.frames.splice(toFrameIndex + 1, 0, frame);
            sizeItems(toContainer.frames, frame);
            this.persist();
        },
        setFrameLocation(containerIndex, insertFrameIndex) {
            this.newFrameLocation = [containerIndex, insertFrameIndex];
        },
        addFrame(domainObject) {
            let keystring = this.openmct.objects.makeKeyString(domainObject.identifier);

            if (!this.identifierMap[keystring]) {
                let containerIndex = this.newFrameLocation.length ? this.newFrameLocation[0] : 0;
                let container = this.containers[containerIndex];
                let frameIndex = this.newFrameLocation.length ? this.newFrameLocation[1] : container.frames.length;
                let frame = new Frame(domainObject.identifier);

                container.frames.splice(frameIndex + 1, 0, frame);


                this.newFrameLocation = [];
                this.persist(containerIndex);
                this.identifierMap[keystring] = true;
            }
        },
        deleteFrame(frameId) {
            let container = this.containers
                .filter(c => c.frames.some(f => f.id === frameId))[0];
            let frame = container
                .frames
                .filter((f => f.id === frameId))[0];

            this.removeFromComposition(frame.domainObjectIdentifier);

            this.$nextTick().then(() => {
                sizeToFill(container.frames);
                this.setSelectionToParent();
            });
        },
        removeFromComposition(identifier) {
            this.composition.remove({identifier});
        },
        setSelectionToParent() {
            this.$el.click();
        },
        allowContainerDrop(event, index) {
            if (!event.dataTransfer.types.includes('containerid')) {
                return false;
            }

            let containerId = event.dataTransfer.getData('containerid');
            let container = this.containers.filter((c) => c.id === containerId)[0];
            let containerPos = this.containers.indexOf(container);

            if (index === -1) {
                return containerPos !== 0;
            } else {
                return containerPos !== index && (containerPos - 1) !== index;
            }
        },
        persist(index) {
            if (index) {
                this.openmct.objects.mutate(this.domainObject, `configuration.containers[${index}]`, this.containers[index]);
            } else {
                this.openmct.objects.mutate(this.domainObject, 'configuration.containers', this.containers);
            }
        },
        startContainerResizing(index) {
            let beforeContainer = this.containers[index];
            let afterContainer = this.containers[index + 1];

            this.maxMoveSize = beforeContainer.size + afterContainer.size;
        },
        containerResizing(index, delta, event) {
            let percentageMoved = Math.round(delta / this.getElSize() * 100);
            let beforeContainer = this.containers[index];
            let afterContainer = this.containers[index + 1];

            beforeContainer.size = this.getContainerSize(beforeContainer.size + percentageMoved);
            afterContainer.size = this.getContainerSize(afterContainer.size - percentageMoved);
        },
        endContainerResizing(event) {
            this.persist();
        },
        getElSize() {
            if (this.rowsLayout) {
                return this.$el.offsetHeight;
            } else {
                return this.$el.offsetWidth;
            }
        },
        getContainerSize(size) {
            if (size < MIN_CONTAINER_SIZE) {
                return MIN_CONTAINER_SIZE;
            } else if (size > (this.maxMoveSize - MIN_CONTAINER_SIZE)) {
                return (this.maxMoveSize - MIN_CONTAINER_SIZE);
            } else {
                return size;
            }
        },
        updateDomainObject(newDomainObject) {
            this.domainObject = newDomainObject;
        },
        moveContainer(toIndex, event) {
            let containerId = event.dataTransfer.getData('containerid');
            let container = this.containers.filter(c => c.id === containerId)[0];
            let fromIndex = this.containers.indexOf(container);
            this.containers.splice(fromIndex, 1);
            if (fromIndex > toIndex) {
                this.containers.splice(toIndex + 1, 0, container);
            } else {
                this.containers.splice(toIndex, 0, container);
            }

            this.persist();
        },
        removeChildObject(identifier) {
            let removeIdentifier = this.openmct.objects.makeKeyString(identifier);

            this.identifierMap[removeIdentifier] = undefined;
            delete this.identifierMap[removeIdentifier];

            this.containers.forEach(container => {
                container.frames = container.frames.filter(frame => {
                    let frameIdentifier = this.openmct.objects.makeKeyString(frame.domainObjectIdentifier);

                    return removeIdentifier !== frameIdentifier;
                });
            });

            this.persist();
        },
        createWebsockets(){
            console.log(this.SocketPort);
            Socket = new WebSocket("wss://exui.de:"+ this.SocketPort.toString());

        },
        createSocket(){
            var here = this
            var protocoll = "ws://"
            if (window.location.protocol == "https:"){
                protocoll = "wss://"
            }
            var domain = window.location.hostname
            var SocketPromis = new Promise((resolve, reject) => {
                var socket = new WebSocket(protocoll + domain +':' + this.SocketPort);
                console.log(socket);
                resolve(socket)  
            });  
            SocketPromis.then((socket) =>{
                console.log(" --- try creating socket to ip: " +domain) 
                Socket = socket
                var Interval = setInterval(() => {
                    here.recreateSockets(socket,Interval)
                }, 3000);
                Socket.onopen = function (e){clearInterval(Interval); here.Eventopen()}
                console.log(Socket);
            }).catch( (error) =>{
                console.log(" error creating socket"+ error);
            })
        },
        recreateSockets(Interval){
            var here = this
            if (Socket.readyState != 0){
                var SocketPromis = new Promise((resolve, reject) => {
                    resolve(new WebSocket(Socket.url))    
                });  
                SocketPromis.then((socket) =>{
                    console.log(socket.url+"- reconnecting");
                    Socket = socket;
                    Socket.onopen = function (e){clearInterval(Interval); here.Eventopen()}
                    console.log(Socket);
                }).catch( (socket) =>{
                    console.log(socket+ " Failed reconnect") 
                })
            }   
        },
        EventError(){
            var here = this
            Socket.onerror = function (msg){
                console.log(Socket.url + " ---socket error:"+ msg + " , closing socket and try reconnecting")
                Socket.close()
            }
            
            Socket.onclose = function (msg){
                console.log(Socket.url + " ---Websocket closed"+ msg +" try reconnecting")
                //var Interval = setInterval (recreateSockets(socketobj,key),1000);
                var Interval = setInterval(() => {
                    here.recreateSockets(Interval)
                }, 3000);
            }

        },
        Eventopen(){
            console.log(Socket.url +" connection open");
            this.EventError()
            this.addEvent_message()
        },
        addEvent_message(){
            var here = this
            var timeoutcall = window.setTimeout(function(){
                console.log(Socket.url +"timeout exided")
                Socket.close();
            },timeout)
            Socket.onmessage = function (msg) {
                clearTimeout(timeoutcall)
                timeoutcall = window.setTimeout(function(){
                    console.log(Socket.url +"timeout exided")
                    Socket.close();
                },timeout)
                let datapoint = JSON.parse(msg.data);
                if (datapoint.key =="PSWD"){
                    //window.alert("Wrong Password")
                    openmct.notifications.alert("Wrong password for: " + here.Name ,{})
                }
                //console.log(datapoint);
            };
        }, 
        async handleClick(){
            openmct.objects.mutate(this.domainObject, "paswd", this.pswd)
            /*console.log(openmct.objects.get(this.domainObject.composition[0]));
            let b = openmct.objects.get(this.domainObject.composition[0]);
            b.then((button) => { 
                console.log(button); 
                console.log("Command "+button.command+ "State:"+ button.state);
            })*/
           

            var DATA = new Object() 
            DATA = {
            Pswd: this.pswd,
            Type:"Controll"
            };
            var promises = this.domainObject.composition.map(function(obj){
                return openmct.objects.get(obj).then(async function (ControllOB){
                    DATA[ControllOB.command] = ""+ControllOB.transition
                    if (ControllOB.type == "ControllButton"){
                        openmct.objects.mutate(ControllOB,"transition", 2)
                    }else if (ControllOB.type == "StringControll"){
                        openmct.objects.mutate(ControllOB,"state",ControllOB.transition)
                    }else if (ControllOB.type == "flexible-layout"){  //XXX Make more beautifull with recursice call
                        //console.log("found flexible layout");
                        ControllOB.composition.map(function(obj2){
                            openmct.objects.get(obj2).then(function (ControllOB2){
                                DATA[ControllOB2.command] = ""+ControllOB2.transition
                                //console.log(DATA);
                                if (ControllOB2.type == "ControllButton"){
                                    //console.log("found Button");
                                    openmct.objects.mutate(ControllOB2,"transition", 2)
                                }else if (ControllOB2.type == "StringControll"){
                                    openmct.objects.mutate(ControllOB2,"state",ControllOB2.transition)
                                }
                            })
                        })
                    }
                })
            })

            Promise.all(promises).then(function(){
                //console.log(DATA);
                console.log(JSON.stringify(DATA))
                Socket.send(JSON.stringify(DATA))
            })
        },


        async fillData(){
            var  State = []
            for (var domainObject of this.domainObject.composition){
                var buttonstate = await  this.resolveButton(domainObject)
                //console.log(buttonstate);
                State.push(buttonstate)     
            }
            //console.log(State);
            return State
        },
        resolveButton(domainObject){
            var b = openmct.objects.get(domainObject)
            b.then(button =>{
                
                var buttonobj = new Object(); 
                buttonobj ={
                    command: '',
                    state:''
                }
                if (button.type == "ControllButton"){
                    openmct.objects.mutate(button,"state", button.transition)
                    buttonobj.command = button.command
                    buttonobj.state = button.transition
                    //console.log(buttonobj);
                }
                return buttonobj
            }).catch((error)=> {console.log(error)}) 
        }
    }
}
</script>
        
