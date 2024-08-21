
<template>
    <div class="Input_wrap">
        <h1>{{ name }}</h1>
        <input :type='type' @change="handleChance()" v-model="inputarg" :placeholder='state' :maxlength="maxlength" :max="maxlength" :minlength="minlength" :min="minlength" :step="range">
        <h2 v-if="isRange">{{ inputarg }}</h2>
    </div>
       
</template>
    

<script>


export default {
    inject: ['openmct', 'domainObject'],
    data: function () {
        return {
            currentDomainObject: this.domainObject,
            telemetryObjects: this.telemetryObject,
            telemetryObjectFormats: this.telemetryObjectFormats,
            subscriptions : this.subscriptions,
            inputarg : this.domainObject.state
            
        };
    },
    computed: {
        name() {
            return this.currentDomainObject.name;
        },
        beforeDestroy() {
            this.removeAllSubscriptions();
        },
        type(){
            return ""+this.currentDomainObject.inputtype
        },
        state(){
            return this.domainObject.state
        },
        maxlength(){
            if (this.domainObject.max){
                return this.domainObject.max
            }
        },
        minlength(){
            if (this.domainObject.min){
                return this.domainObject.min
            }
        },
        range(){
            if (this.domainObject.range){
                return this.domainObject.range
            }
        },
        isRange(){
            console.log(""+this.domainObject.type == "range");
            return this.currentDomainObject.inputtype == "range"
        }
    },
    methods: {
        tryObject(telemetryObject) {
            // grab information we need from the added telmetry object
            const key = this.openmct.objects.makeKeyString(telemetryObject.identifier);
            this.telemetryObjects[key] = telemetryObject;
            const metadata = this.openmct.telemetry.getMetadata(telemetryObject);
            this.telemetryObjectFormats[key] = this.openmct.telemetry.getFormatMap(metadata);
            const telemetryObjectPath = [telemetryObject, ...this.path];
            const telemetryIsAlias = this.openmct.objects.isObjectPathToALink(telemetryObject, telemetryObjectPath);

            // ask for the current telemetry data, then subcribe for changes
            this.requestDataFor(telemetryObject);
            this.subscribeToObject(telemetryObject);
        },
        removeAllSubscriptions() {
            subscriptions.forEach(subscription => subscription.unsubscribe());
            subscriptions = [];
        },
        removeSubscription(key) {
            const found = subscriptions.findIndex(subscription => subscription.key === key);
            if (found > -1) {
                subscriptions[found].unsubscribe();
                subscriptions.splice(found, 1);
            }
        },
        removeTelemetryObject(identifier) {
            const key = openmct.objects.makeKeyString(identifier);
            if (telemetryObjects[key]) {
                delete telemetryObjects[key];
            }

            if (telemetryObjectFormats && telemetryObjectFormats[key]) {
                delete telemetryObjectFormats[key];
            }

            this.removeSubscription(key);
        },
        subscribeToObject(telemetryObject) {
            const key = this.openmct.objects.makeKeyString(telemetryObject.identifier);
            const options = {}
            console.log("Button requested subscribe");
            
            const unsubscribe = this.openmct.telemetry.subscribe(telemetryObject,
                data => this.addDataToButton(data) 
                , options);

        },
        subscribeToAll() {
            const telemetryObjects = Object.values(telemetryObjects);
            telemetryObjects.forEach(subscribeToObject);
        },
        addDataToButton(data){
            //console.log(data)
            if(this.currentDomainObject.state != data.value){
                console.log(this.currentDomainObject.name +' '+ this.currentDomainObject.state+ ' ' +data.value);
                openmct.objects.mutate(this.currentDomainObject, "state", data.value)
            }
        },
        handleChance(){
            console.log(this.inputarg);
            var here = this
            if (this.domainObject.inputtype != 'text' && this.inputarg> this.domainObject.max)
                this.inputarg = this.domainObject.max
            if (this.domainObject.inputtype != 'text' && this.inputarg<this.domainObject.min)
                this.inputarg = this.domainObject.min
            openmct.objects.mutate(this.currentDomainObject, "transition", ""+this.inputarg)
            var timeout = setTimeout(()=>{
                here.inputarg = here.domainObject.state
                openmct.objects.mutate(here.currentDomainObject, "transition", ""+here.domainObject.state)
            },20000)
        }
        
    },
    mounted: function(){
        this.$nextTick(function (){
            this.subscribeToObject(this.currentDomainObject)
        })
    }
};
</script>


