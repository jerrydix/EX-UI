<template>
    <div>
        <h1>{{ SRC.name }}/{{ SEQ.name }}</h1>
        <!--<div class="Paswd_wrap">
                <h1>Password:</h1>
                <input type="Password" @change="openmct.objects.mutate(currentDomainObject,'paswd',this.pswd)" v-model="pswd">
        </div>-->
        <table style="table-layout: fixed;">
            <colgroup>
                <col style="width: 3em">
                <col style="width: 3em">
                <col style="width: 8em">
                <col v-for="o in SEQ.outputs" :style="{ width: (100 * 1 / colCount() + '%') }">
                <col v-if="SEQ.type === 'primary'" v-for="i in IGN" :style="{ width: (100 * 1 / colCount() + '%') }">
                <col v-if="SEQ.type === 'primary'" style="width: 6em"> 
                <col v-if="SEQ.type === 'primary'" v-for="i in ACTUALREDSENS" :style="{ width: (100 * 1 / colCount() + '%') }">               
                <col v-if="SEQ.type === 'primary'" style="width: 2em">
            </colgroup>
            <thead>
                <tr>
                    <th colspan="3">Step Duration [ms]</th>
                    <th v-for="key in SEQ.outputs">
                        <div style="display: flex; flex-direction: column; align-items: center;">
                            <div style="writing-mode: sideways-lr;">
                                {{ getInputNameForValveKey(key) }}
                            </div>
                        </div>
                    </th>
                    <th v-if='SEQ.type === "primary"' v-for="ign in IGN">
                        <div style="display: flex; flex-direction: column; align-items: center;">
                            <div style="writing-mode: sideways-lr;">
                                {{ ign.name }}
                            </div>
                        </div>
                    </th>
                    <th v-if='SEQ.type === "primary"'>
                        <div style="display: flex; flex-direction: column; align-items: center;">
                            <div style="writing-mode: sideways-lr;">
                                Red Delays
                            </div>
                        </div>
                    </th>
                    <th v-if='SEQ.type === "primary"' v-for="o in ACTUALREDSENS">
                        <div style="display: flex; flex-direction: column; gap: 5px; align-items: center;">
                            <div style="writing-mode: sideways-lr;">{{ getInputNameForSensorKey(o.key) }}</div>
                            <a class="icon-pencil" @click="showEditRedlineDialog(o)"></a>
                            <a class="icon-trash" @click="showRemoveRedlineDialog(o)"></a>
                        </div>
                    </th>
                    <th v-if="SEQ.type === 'primary'"></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(step, stepIdx) in Sequence">
                    <td style="text-align: center; width: 3em;">
                        {{ stepIdx + 1 }}
                    </td>
                    <td style="text-align: center; width: 3em">
                        <a v-if="stepIdx != 0" class="icon-trash" @click="deleteStep(stepIdx)"></a>
                    </td>
                    <td style="text-align: center">
                        <input type="text" size="5" v-model.number="step.time">
                    </td>
                    <td class="" v-for="key in SEQ.outputs"
                        :style="{ backgroundColor: step.outputs[key] < 2 ? (step.outputs[key] == 1 ? 'green' : 'red') : 'gold' }"
                        @click="toggleStep(stepIdx, key)">
                    </td>
                    <td v-if="SEQ.type === 'primary'" class="" v-for="o in IGN"
                        :style="{ backgroundColor: step.outputs[o.key] == 1 ? 'green' : 'red' }"
                        @click="toggleStep(stepIdx, o.key)" :disabled="testDisabled(stepIdx, o.key)">
                    </td>
                    <td v-if="SEQ.type === 'primary'">
                        <!-- values are what we store, and we show what we store + 1 -->
                        <select :value="step.outputs[REDSEQKEY]" @change="selectRedlineSeq($event, stepIdx)">
                            <option v-for="item in REDSEQNUM" :value="item"
                                :disabled="redlineSeqDisabled(item, stepIdx)">
                                {{ item + 1 }}
                            </option>
                        </select>
                    </td>
                    <td v-if="SEQ.type === 'primary'" class="" v-for="o in ACTUALREDSENS"
                        :style="{ backgroundColor: step.outputs[o.key] == 1 ? 'green' : 'red' }"
                        @click="toggleStep(stepIdx, o.key)">
                    </td>
                    <td v-if="stepIdx === 0 && SEQ.type === 'primary'" @click="showRedlineDialog()"
                        style="vertical-align: middle; background: #575757; font-weight: bold;"
                        :rowspan="Sequence.length + 1" :disabled="selectedREDSENS.length >= REDSENS.length">
                        <a class="icon-plus"></a>
                    </td>
                </tr>
            </tbody>
            <tfoot>
                <tr>
                    <th :colspan="colCount()" style="text-align: center" @click="addStep()"
                        :disabled="Sequence.length >= SEQ.opcua.amount - 1">
                        <a class="icon-plus"></a>
                    </th>
                </tr>
            </tfoot>
        </table>
        <div class="Button-wrap" style="display: inline-block">
            <button class="ControllButton" id="SendButton" @click="handleSend()" type="button"
                :disabled="sendDisabled">Send to Target</button>
        </div>
        <div class="Button-wrap" style="display: inline-block">
            <button class="ControllButton" id="LoadButton" @click="handleLoad()" type="button">Load from Target</button>
        </div>
        <div v-if="SEQ.type === 'primary'" class="Button-wrap" style="display: inline-block; float: right">
            <button class="launch-button" id="Start" @click="handleStart()" type="button">Start Sequence</button>
        </div>
        <br />
        <a :href="sequenceJsonUri" download="sequence.json">
            <span class="icon-export"></span>Export Sequence
        </a><br>
        <label for="importFile">
            <span class="icon-import"></span>Import Sequence:
        </label><br>
        <input type="file" id="importFile" name="importFile" @change="importSequence($event)">


        <div v-if="showDialog && SEQ.type === 'primary'" class="redline-dialog">
            <div class="redline-dialog-content">
                <div class="close"
                    @click="selected = { key: '', lower: -1000000, upper: 1000000, timeout: 0 }, showDialog = false"
                    style="display: inline-block;"><a class="icon-x"></a>
                </div>
                <h2 style="display: inline-block;">Add New Redlines</h2>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div>
                        <label>Sensor:</label>
                        <select :value="selected.key" @change="selectSensor(false, selected, $event)">
                            <option v-for="sensor in REDSENS" :value="sensor.key"
                                :disabled="selectedREDSENS.indexOf(sensor.key) >= 0">
                                {{ sensor.name }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label>Upper Limit:</label>
                        <input type="text" v-model.number="selected.upper">
                    </div>
                    <div>
                        <label>Lower Limit:</label>
                        <input type="text" v-model.number="selected.lower">
                    </div>
                    <div>
                        <label>Signal Duration [ms]:</label>
                        <input type="text" v-model.number="selected.timeout">
                    </div>
                    <button
                        :disabled="selected.key == '' || (selected.upper == REDLIMIT && selected.lower == -REDLIMIT && selected.timeout == 0)"
                        class="add-button" @click="showDialog = false; addRedlineColumn()">Add</button>
                </div>
            </div>
        </div>


        <div v-if="showEditDialog && SEQ.type === 'primary'" class="redline-dialog">
            <div class="redline-dialog-content">
                <div class="close" @click="selectedREDSENS = selectedREDSENS_buf.slice(); showEditDialog = false;"
                    style="display: inline-block;"><a class="icon-x"></a></div>
                <h2 style="display: inline-block;">Edit Redlines for {{ getInputNameForSensorKey(selected.key) }}</h2>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div>
                        <label>Sensor:</label>
                        <select :value="selected_buf.key" @change="selectSensor(true, selected_buf, $event)">
                            <option v-for="sensor in REDSENS" :value="sensor.key"
                                :disabled="selectedREDSENS.indexOf(sensor.key) >= 0">
                                {{ getInputNameForSensorKey(sensor.key) }}
                            </option>
                        </select>
                    </div>
                    <div>
                        <label>Upper Limit:</label>
                        <input type="text" v-model.number="selected_buf.upper">
                    </div>
                    <div>
                        <label>Lower Limit:</label>
                        <input type="text" v-model.number="selected_buf.lower">
                    </div>
                    <div>
                        <label>Signal Duration [ms]:</label>
                        <input type="text" v-model.number="selected_buf.timeout">
                    </div>
                    <button
                        :disabled="selected_buf.key == '' || (selected_buf.upper == REDLIMIT && selected_buf.lower == -REDLIMIT && selected_buf.timeout == 0)"
                        class="add-button" @click="showEditDialog = false; updateRedlineColumn();">Save</button>
                </div>
            </div>
        </div>
    </div>
</template>
<script>
//import ReconnectingWebsocket from "../../robust_websocket/robust_websocket.js";

var Socket = null;
var socketInterval = null;
var reconnectInterval = null;
var socketTimeout = null;
var preloadInterval = null;
const timeout = 5000;


export default {
    inject: ['openmct', 'domainObject'],
    data: function () {
        let source, sequence, inputs, datapointsWithRedlines, redlineSequenceNumbers, igniters;
        [source, sequence, inputs, datapointsWithRedlines, redlineSequenceNumbers, igniters] = this.domainObject.adapter;
        return {
            currentDomainObject: this.domainObject,
            SRC: source,
            SEQ: sequence,
            REDSENS: datapointsWithRedlines,
            ACTUALREDSENS: [],
            selectedREDSENS: [],
            selectedREDSENS_buf: [],
            selected: { key: '', lower: -1000000, upper: 1000000, timeout: 0 },
            selected_buf: { key: '', lower: -1000000, upper: 1000000, timeout: 0 },
            INP: inputs,
            REDSEQNUM: redlineSequenceNumbers,
            REDSEQKEY: "RED",
            REDLIMIT: 1000000, //big number representing "infinity"
            IGN: igniters,
            SRCKEY: this.domainObject.adapter.key,
            pswd: this.domainObject.paswd,
            SocketPort: source.openport, 
            Sequence: this.domainObject.Sequence,
            dialogTimepoint: 0,
            dialogOutput: "",
            dialogStep: 0,
            showDialog: false,
            showEditDialog: false,
            sendDisabled: false,
            downloadRequested: false, // Indicates that a sequence has been requested for download
            readbackRequested: false, // Indicates a sequence has been requested for readback after sending
            //sequenceLength: 10,
        };
    },
    computed: {
        sequenceJsonUri() {
            let completeJson = {
                sequence: this.Sequence,
            }
            if (this.SEQ.type === 'primary') {
                completeJson.redlines = this.ACTUALREDSENS;
            }
            completeJson = JSON.stringify(completeJson);
            let blob = new Blob([completeJson], { type: 'application/json' });
            let blobUrl = URL.createObjectURL(blob);
            return blobUrl;
        }
    },
    methods: {
        importSequence(e) {
            console.log("Loading " + e.target.files[0].name);
            e.target.files[0].text().then((str) => {
                let completeObject = JSON.parse(str);
                this.Sequence = completeObject.sequence;
                if (this.SEQ.type === 'primary') {
                    this.ACTUALREDSENS = completeObject.redlines;
                }
            });
        },
        colCount() {
            return 3 + this.SEQ.outputs.length + this.IGN.length  + (this.REDSEQNUM.length == 0 ? 0 : 1) + this.ACTUALREDSENS.length
        },
        addStep(outputName) {
            this.Sequence.push({ time: 0, outputs: {} });
            for (const key of this.SEQ.outputs) {
                let prevOutput = this.Sequence[this.Sequence.length - 2].outputs[key];
                this.Sequence[this.Sequence.length - 1].outputs[key] = prevOutput;
            }
            for (const o of this.IGN) {
                let prevOutput = this.Sequence[this.Sequence.length - 2].outputs[o.key];
                this.Sequence[this.Sequence.length - 1].outputs[o.key] = prevOutput;
            }
            for (const o of this.REDSENS) {
                let prevOutput = this.Sequence[this.Sequence.length - 2].outputs[o.key];
                this.Sequence[this.Sequence.length - 1].outputs[o.key] = prevOutput;
            }
            if (this.SEQ.type === 'primary') {
                this.Sequence[this.Sequence.length - 1].outputs[this.REDSEQKEY] = this.Sequence[this.Sequence.length - 2].outputs[this.REDSEQKEY];
            }
        },
        deleteStep(stepIdx) {
            this.Sequence.splice(stepIdx, 1);
        },
        testDisabled(stepIdx, key) {
            let isActive = false;
            for (let step of this.Sequence) {
                if (step.outputs[key] == 1) {
                    isActive = true;
                }
            }
            if (!isActive) {
                return false;
            }

            let existsNext = stepIdx + 1 < this.Sequence.length;
            let existsPrev = stepIdx - 1 > -1;
            let currentVal = this.Sequence[stepIdx].outputs[key];
            let nextVal;
            let prevVal;

            if (existsNext) {
                nextVal = this.Sequence[stepIdx + 1].outputs[key];
            } 

            if (existsPrev) {
                prevVal = this.Sequence[stepIdx - 1].outputs[key];
            }

            if (currentVal == 0 && (existsNext && nextVal == 1 || existsPrev && prevVal == 1)) {
                return false;
            }

            if (currentVal == 1 && ((existsNext && !existsPrev && nextVal == 1 || nextVal == 0)|| (existsPrev && !existsNext && prevVal == 1 || prevVal == 0))) {
                return false;
            }

            if (currentVal == 1 && ((existsNext && existsPrev && prevVal == 0 && nextVal == 0) 
            || (existsNext && existsPrev && (prevVal == 1 && nextVal == 0 || prevVal == 0 && nextVal == 1)))) {
                return false;
            }

            if ((!existsNext && !existsPrev && currentVal == 1)
            || (!existsPrev && stepIdx + 2 == this.Sequence.length)
            || (!existsNext && stepIdx - 2 == -1)) {
                return false;
            }

            
            return true;
        },
        showRedlineDialog() {
            this.showDialog = true;
        },
        addRedlineColumn() {
            this.ACTUALREDSENS.push(this.selected);
            this.selected = { key: '', lower: -this.REDLIMIT, upper: this.REDLIMIT, timeout: 0 };
        },
        updateRedlineColumn() {
            this.selected.key = this.selected_buf.key;
            this.selected.lower = this.selected_buf.lower;
            this.selected.upper = this.selected_buf.upper;
            this.selected.timeout = this.selected_buf.timeout;

            let i = this.ACTUALREDSENS.indexOf(this.selected.key);
            this.ACTUALREDSENS[i] = JSON.parse(JSON.stringify(this.selected));
            this.selected = { key: '', lower: -this.REDLIMIT, upper: this.REDLIMIT, timeout: 0 };
        },
        showEditRedlineDialog(current) {
            this.selected = current;
            this.selected_buf = JSON.parse(JSON.stringify(current));
            this.selectedREDSENS_buf = this.selectedREDSENS.slice();
            this.showEditDialog = true;
        },
        removeRedlineColumn(key) {
            for (let i = 0; i < this.ACTUALREDSENS.length; i++) {
                if (this.ACTUALREDSENS[i].key === key) {

                    this.Sequence.forEach(step => {
                        step.outputs[key] = 0;
                    });

                    this.selectedREDSENS.splice(this.selectedREDSENS.indexOf(key), 1);
                    this.ACTUALREDSENS.splice(i, 1);
                    break;
                }
            }
        },
        showRemoveRedlineDialog(current) {
            const prompt = this.openmct.overlays.dialog({
                iconClass: 'alert',
                message: "Remove Redlines for " + this.getInputNameForSensorKey(current.key) + "?",
                buttons: [
                    {
                        label: 'Yes',
                        emphasis: 'true',
                        callback: () => {
                            this.removeRedlineColumn(current.key);
                            prompt.dismiss();
                        }
                    },
                    {
                        label: 'Cancel',
                        callback: function () {
                            prompt.dismiss();
                        }
                    }
                ]
            });
        },
        selectRedlineSeq(e, stepIdx) {
            let newVal = parseInt(e.target.value);
            for (let i = stepIdx; i < this.Sequence.length; i++) {
                if (this.Sequence[i].outputs[this.REDSEQKEY] === newVal) {
                    break;
                }
                this.Sequence[i].outputs[this.REDSEQKEY] = newVal;
            }

            //these two lines are needed to force vue to update the view
            this.Sequence.push({ time: 1000, outputs: {} });
            this.Sequence.pop()
        },
        redlineSeqDisabled(item, stepIdx) {
            if(stepIdx === 0){
                return item !== 0;
            }

            let prevVal = this.Sequence[stepIdx - 1].outputs[this.REDSEQKEY];
            if (item != prevVal + 1 && item != prevVal) {
                return true;
            }

            return false;
        },
        selectSensor(edit, selected, e) {
            let newKey = e.target.value
            let oldKey = selected.key
            //if value same as old, skip
            if (selected.key === newKey) {
                return;
            }

            //if old value was some key, remove it from selected
            if (oldKey !== '') {
                let index = this.selectedREDSENS.indexOf(oldKey)
                if (index >= 0) { this.selectedREDSENS.splice(index, 1); }
            }

            //add new key to selected if exists
            let sensor = this.REDSENS.find(sensor => sensor.key === newKey)
            if (sensor) {
                this.selectedREDSENS.push(newKey)
            }

            //Move outputs from old key to new key
            if (edit) {
                for (let i = 0; i < this.Sequence.length; i++) {
                    let step = this.Sequence[i];
                    step.outputs[newKey] = step.outputs[oldKey];
                    step.outputs[oldKey] = 0;
                }
            }

            //update key of sensor
            selected.key = newKey


        },
        toggleStep(stepIdx, outputName) {
            // Need to copy step, then splice it back into sequence
            // array to have vue react to the change
            let stepCopy = { ...this.Sequence[stepIdx] }

            // adds one and does: 
            //    mod 2 if sequence (value 0 or 1), 
            //    mod 3 if purge sequence (values 0, 1 or 2)
            let modOutput = 2
            if (this.SEQ.type === 'purge' || this.SEQ.type === 'redline') {
                modOutput = 3
            }
            stepCopy.outputs[outputName] = (stepCopy.outputs[outputName] + 1) % modOutput;

            this.Sequence.splice(stepIdx, 1, stepCopy);
        },
        getInputNameForValveKey(key) {
            let result = this.INP.find(i => {
                return i.key == key;
            });

            if (typeof result !== 'undefined') {
                return result.name;
            }

            return "undefined";
        },
        getInputNameForSensorKey(key) {
            if (key === undefined) {
                return "error";
            }
            let result = this.REDSENS.find(i => {
                return i.key == key;
            });
            if (typeof result !== 'undefined') {
                return result.name;
            }

            return "";
        },
        formatDuration(seconds) {
            if (seconds < 1.0) {
                return seconds * 1000 + ' ms';
            } else {
                return seconds + ' s';
            }
        },
        redlineDelaysFromSequence() {
            if(this.REDSEQNUM.length === 0){
                return [];
            }

            let redlineSequenceDelays = new Array(this.REDSEQNUM.length - 1).fill(0);
            let j = 0;
            let sum = 0;
            for (let i = 0; i < this.Sequence.length; i++) {
                if (i === this.Sequence.length - 1) {
                    //in last step
                    if (this.Sequence[i].outputs[this.REDSEQKEY] != this.REDSEQNUM[this.REDSEQNUM.length - 1]) {
                        redlineSequenceDelays[j] = 0;
                    }
                    break;
                }

                sum += this.Sequence[i].time;

                if (this.Sequence[i].outputs[this.REDSEQKEY] != this.Sequence[i + 1].outputs[this.REDSEQKEY]) {
                    //next step is different
                    redlineSequenceDelays[j] = sum;
                    sum = 0;
                    j++;
                }
            }

            return redlineSequenceDelays
        },
        handleSend() {
            this.sendDisabled = true;

            let primarySequence = [];
            let triggerSequence = [];

            for (let i = 0; i < this.Sequence.length; i++) {
                let step = this.Sequence[i];
                let primaryStep = { time: 0, outputs: {} };
                let triggerStep = { time: 0, outputs: {} };
                for (const key of this.SEQ.outputs) {
                    primaryStep.outputs[key] = step.outputs[key];
                }
                for (const o of this.REDSENS) {
                    triggerStep.outputs[o.key] = step.outputs[o.key];
                }
                primaryStep.time = step.time;
                triggerStep.time = step.time;
                primarySequence.push(primaryStep);
                triggerSequence.push(triggerStep);
            }

            //update igniters list correctly from sequence
            let igniters = this.transferToIgnitersList();

            let redlineSequenceDelays = this.redlineDelaysFromSequence();

            let Data = {
                commands: [
                    {
                        cmd: 'load_sequence',
                        key: this.SEQ.key,
                        sequence: primarySequence,
                    },
                    {
                        cmd: 'load_sequence',
                        key: 'redline_trigger_sequence',
                        sequence: triggerSequence,
                    },
                    {
                        cmd: 'load_redlines',
                        redlines: this.ACTUALREDSENS,
                    },
                    {
                        cmd: 'load_redline_delays',
                        delays: redlineSequenceDelays,
                    },
                    {
                        cmd: 'load_igniters',
                        igniters: igniters,
                    }
                ]
            }

            if (this.SEQ.type !== 'primary') {
                Data.commands.splice(1, Data.commands.length - 1);
            }
            console.log(JSON.stringify(Data))
            Socket.send(JSON.stringify(Data))

            this.requestReadbackSequence();
        },
        handleLoad() {
            this.requestDownloadSequence();
        },
        handleStart() {
            let Data = {
                commands: [
                    {
                        cmd: 'start_sequence',
                        key: this.SEQ.key,
                    }
                ]
            }
            let prompt = openmct.overlays.dialog({
                iconClass: 'alert',
                message: `Start sequence?`,
                buttons: [
                    {
                        label: 'START',
                        emphasis: 'true',
                        callback: function () {
                            console.log(JSON.stringify(Data))
                            Socket.send(JSON.stringify(Data))
                            openmct.notifications.info("Sequence initiated.");
                            prompt.dismiss();
                        }
                    },
                    {
                        label: 'Cancel',
                        callback: function () {
                            prompt.dismiss();
                        }
                    }
                ]
            });
        },
        requestReadbackSequence() {
            this.readbackRequested = true;
            this.requestSequence();
        },
        requestDownloadSequence() {
            this.downloadRequested = true;
            this.requestSequence();
        },
        requestSequence() {
            let Data = {
                commands: [
                    {
                        cmd: 'download_sequence',
                        key: this.SEQ.key,
                    },
                    {
                        cmd: 'download_sequence',
                        key: 'redline_trigger_sequence',
                    },
                    {
                        cmd: 'download_redlines',
                    },
                    {
                        cmd: 'download_redline_delays',
                    },
                    {
                        cmd: 'download_igniters',
                    }
                ]
            }
            if (this.SEQ.type !== 'primary') {
                Data.commands.splice(1, Data.commands.length - 1);
            }
            console.log(JSON.stringify(Data))
            Socket.send(JSON.stringify(Data))
        },
        createSocket() {
            var here = this
            var protocoll = "ws://"
            if (window.location.protocol == "https:") {
                protocoll = "wss://"
            }

            if (Socket != null) {
                Socket.close();
            }

            var domain = window.location.hostname
            //var socket = ReconnectingWebsocket(protocoll + domain + ':' + here.SocketPort);
            //Socket = socket;
            //this.addEvent_message();
            var SocketPromis = new Promise((resolve, reject) => {
                var socket = new WebSocket(protocoll + domain + ':' + here.SocketPort);
                console.log(socket);
                resolve(socket)
            });
            SocketPromis.then((socket) => {
                console.log(" --- try creating socket to ip: " + domain)
                Socket = socket
                reconnectInterval = setInterval(() => {
                    here.recreateSockets()
                }, 3000);
                Socket.onopen = function (e) {
                    clearInterval(reconnectInterval);
                    here.Eventopen()
                    here.sendKeepalive();
                    clearInterval(socketInterval);
                    socketInterval = setInterval(() => {
                        here.sendKeepalive();
                    }, 500);
                }
                console.log(Socket);
            }).catch((error) => {
                console.log(" error creating socket" + error);
            })
        },
        sendKeepalive() {
            Socket.send(JSON.stringify({
                msg_type: 'keepalive',
            }));
        },
        recreateSockets() {
            var here = this
            clearInterval(socketInterval);

            if (Socket != null) {
                Socket.close();
            }

            var socket = new WebSocket(Socket.url);
            console.log(socket.url + "- reconnecting");
            socket.onopen = function (e) {
                Socket = socket;
                clearInterval(reconnectInterval);
                here.Eventopen()
                clearInterval(socketInterval);
                socketInterval = setInterval(() => {
                    here.sendKeepalive();
                }, 500);
            }
        },
        EventError() {
            var here = this
            Socket.onerror = function (msg) {
                console.log(Socket.url + " ---socket error:" + msg + " , closing socket and try reconnecting")
            }

            Socket.onclose = function (msg) {
                console.log(Socket.url + " ---Websocket closed" + msg + " try reconnecting")
                //var Interval = setInterval (recreateSockets(),1000);
            }
        },
        Eventopen() {
            console.log(Socket.url + " connection open");
            this.EventError()
            this.addEvent_message()
        },
        addEvent_message() {
            var here = this
            clearTimeout(socketTimeout);
            socketTimeout = window.setTimeout(function () {
                console.log(Socket.url + " timeout exceeded")
                reconnectInterval = setInterval(() => {
                    here.recreateSockets()
                }, 3000);
            }, timeout)
            Socket.onmessage = function (msg) {
                clearTimeout(socketTimeout)
                socketTimeout = window.setTimeout(function () {
                    console.log(Socket.url + " timeout exceeded")
                    reconnectInterval = setInterval(() => {
                        here.recreateSockets()
                    }, 3000);
                }, timeout)

                let datapoint = JSON.parse(msg.data);

                if (datapoint.length !== undefined && datapoint.length !== 0) {
                    let primarySequence = [];
                    let igniters = null;
                    let triggerSequence = null;
                    let redlineDelays = null;

                    let checkObj = {}
                    checkObj.ACTUALREDSENS = []
                    checkObj.Sequence = []

                    for (let e of datapoint) {
                        if (!e || !e.type) {
                            continue;
                        }

                        switch (e.type) {
                            case "download_sequence_response":
                                console.log("download_sequence_response", here.downloadRequested, here.readbackRequested, e.sequence);
                                if (e.sequence_type == "primary" || e.sequence_type == "redline" || e.sequence_type == "purge") {
                                    primarySequence = e.sequence;
                                } else if (e.sequence_type == "redline_trigger_sequence") {
                                    triggerSequence = e.sequence;
                                } else {
                                    console.log("Error: Unknown sequence type ", e.sequence_type);
                                }
                                break
                            case "download_redlines_response":
                                console.log("download_redlines_response", here.downloadRequested, here.readbackRequested, e.redlines);
                                checkObj.ACTUALREDSENS = e.redlines
                                break;
                            case "download_redline_delays_response":
                                console.log("download_redline_delays_response", here.downloadRequested, here.readbackRequested, e.delays);
                                redlineDelays = e.delays;
                                break;
                            case "download_igniters_response":
                                console.log("download_igniters_response", here.downloadRequested, here.readbackRequested, e.igniters);
                                igniters = e.igniters;
                                break;
                            default:
                                console.log("ERROR, unknown command: ", e);
                                break;
                        }
                    }

                    let combinedSequence = [];

                    //setting correct igniter sequence after download
                    if (igniters !== null) {
                        for (let ign of igniters) {
                            let delayTime = ign.delay;
                            let delayCounter = 0.0;

                            let durationTime = ign.duration;
                            let durationCounter = 0.0;

                            for (let step of primarySequence) {
                                if (delayCounter < delayTime) {
                                    delayCounter += step.time;
                                    step.outputs[ign.key] = 0;
                                } else if (durationCounter < durationTime && ign.enabled) {
                                    durationCounter += step.time;
                                    step.outputs[ign.key] = 1;
                                } else {
                                    step.outputs[ign.key] = 0;
                                }
                            }
                        }
                    }

                    //case for redline sequence
                    if (triggerSequence === null) {
                        combinedSequence = primarySequence;
                    }


                    //case for primary sequence   
                    if (triggerSequence !== null && primarySequence.length == triggerSequence.length) {
                        for (let i = 0; i < primarySequence.length; i++) {
                            let primaryStep = primarySequence[i];
                            let triggerStep = triggerSequence[i];
                            let combinedStep = { time: 0, outputs: {} };

                            for (const key of here.SEQ.outputs) {
                                combinedStep.outputs[key] = primaryStep.outputs[key];
                            }
                            for (const ign of igniters) {
                                combinedStep.outputs[ign.key] = primaryStep.outputs[ign.key];
                            }
                            for (const o of here.REDSENS) {
                                combinedStep.outputs[o.key] = triggerStep.outputs[o.key];
                            }

                            //timestep is the same length for all three sequences
                            combinedStep.time = primaryStep.time
                            combinedSequence.push(combinedStep);
                        }
                    } else if (triggerSequence !== null) {
                        console.log("Error: Sequence length mismatch.");
                    }


                    if (redlineDelays !== null) {
                        //set the "delay" after last redseq to 0
                        redlineDelays.push(0);

                        let j = 0;

                        for (let i = 0; i < combinedSequence.length; i++) {
                            if (redlineDelays[j] === 0) {
                                //if we find 0, fill out till the end
                                combinedSequence[i].outputs[here.REDSEQKEY] = j;
                                continue;
                            }

                            redlineDelays[j] -= combinedSequence[i].time;
                            combinedSequence[i].outputs[here.REDSEQKEY] = j;

                            if (redlineDelays[j] === 0) {
                                //if became zero, go to next
                                j++;
                            }

                            if (redlineDelays[j] < 0) {
                                console.error("Delays for redline sequences dont coincide with primary sequence steps")
                            }
                        }

                    }

                    checkObj.Sequence = combinedSequence;

                    if (here.downloadRequested) {
                        here.downloadRequested = false;
                        here.Sequence = checkObj.Sequence;

                        here.ACTUALREDSENS = checkObj.ACTUALREDSENS;
                        here.selectedREDSENS = here.ACTUALREDSENS.map(redline => redline.key)

                    } else if (here.readbackRequested) {
                        here.readbackRequested = false;
                        here.sendDisabled = false;

                        // ACTUALREDSENS are arrays of redline object, sort to guarantee correct comparison
                        checkObj.ACTUALREDSENS.sort((a, b) => a.key < b.key)
                        here.ACTUALREDSENS.sort((a, b) => a.key < b.key)


                        //neede for sorting keys the same way for all nested objects of an object, to allow comparison of strings
                        //taken from stackoverflow
                        const replacer = (key, value) =>
                            value instanceof Object && !(value instanceof Array) ?
                                Object.keys(value)
                                    .sort()
                                    .reduce((sorted, key) => {
                                        sorted[key] = value[key];
                                        return sorted
                                    }, {}) :
                                value;

                        console.log(JSON.stringify(here.Sequence, replacer), JSON.stringify(checkObj.Sequence, replacer),
                            JSON.stringify(here.ACTUALREDSENS, replacer), JSON.stringify(checkObj.ACTUALREDSENS, replacer));

                        if (JSON.stringify(here.Sequence, replacer) == JSON.stringify(checkObj.Sequence, replacer) &&
                            JSON.stringify(here.ACTUALREDSENS, replacer) == JSON.stringify(checkObj.ACTUALREDSENS, replacer)) {
                            openmct.notifications.info("Success: Sequence uploaded and verified.");
                        } else {
                            openmct.notifications.error("Error: Sequence upload failed - readback mismatch.");
                        }
                    }
                }

            };

        },
        transferToIgnitersList() {
            let igniters = []
            for (const ign of this.IGN) {
                let delayTime = 0.0;
                let durationTime = 0.0;
                let enabled = false;

                for (const step of this.Sequence) {
                    if (step.outputs[ign.key] == 0 && !enabled) {
                        delayTime += step.time;
                    }
                    if (step.outputs[ign.key] == 1) {
                        enabled = true;
                        durationTime += step.time;
                    }
                }

                let igniter = {}

                igniter.key = ign.key
                igniter.enabled = enabled;
                igniter.delay = delayTime;
                igniter.duration = durationTime;

                igniters.push(igniter)
            }

            return igniters
        },
        loadEmpty() {
            this.Sequence = [{ time: 0, outputs: {} }];
            for (const key of this.SEQ.outputs) {
                this.Sequence[0].outputs[key] = 0;
            }
            if (this.SEQ.type === 'primary') {
                console.log("igniters ", this.REDSENS)
                for (const o of this.IGN) {
                    this.Sequence[0].outputs[o.key] = 0;
                }
                console.log("redline sensors ", this.REDSENS)
                for (const o of this.REDSENS) {
                    this.Sequence[0].outputs[o.key] = 0;
                }

                this.Sequence[0].outputs[this.REDSEQKEY] = 0;
            }
        },
        preload() {
            var here = this;
            var preloaded = false;
            preloadInterval = setInterval(() => {
                if (preloaded) {
                    clearInterval(preloadInterval);
                }

                if (Socket.readyState === WebSocket.OPEN) {
                    here.handleLoad();
                    preloaded = true;
                }
            }, 50)

        }
    },
    mounted: async function () {
        this.createSocket();

        this.Sequence = [];

        //for when backend is dead
        this.loadEmpty();

        this.preload();
    },
    beforeDestroy: function() {
        clearTimeout(socketTimeout);
        clearInterval(socketInterval);
        clearInterval(reconnectInterval);
        clearInterval(preloadInterval);
        if (Socket != null) {
            Socket.close();
        }
    },
    destroyed: function(){
        openmct.objects.mutate(this.domainObject,"Sequence",this.Sequence)
    }
    
};
</script>
