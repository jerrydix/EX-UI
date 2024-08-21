<template>
    <div class="Button_wrap">
        <button class="ControllButton" :style="{backgroundColor : BckColor, borderColor : BColor} " @click="handleClick()"  type="button">{{name}}</button>
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
            
        };
    },
    computed: {
        name() {
            return this.currentDomainObject.name;
        },
        adapter_key() {
            return (this.currentDomainObject.adapter+"_"+this.currentDomainObject.command);
        },
        beforeDestroy() {
            this.removeAllSubscriptions();
        },
        BckColor(){
            if(this.domainObject.transition == 1){
                return "#09ff00"
            }else if (this.domainObject.transition == 2){
                return "#636363"
            }else{
                return "#fa6400"

            }
        },
        BColor(){
            if (this.currentDomainObject.state){
                return "#09ff00"
            }else{
                return "#fa6400"
            }

        },
        state(){
            return this.domainObject.transition
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
            //console.log("Button requested subscribe");
            
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
            if(this.currentDomainObject.state != (data.value == 1)){
                //console.log(this.currentDomainObject.name +' '+ this.currentDomainObject.state+ ' ' +data.value);
                openmct.objects.mutate(this.currentDomainObject, "state", data.value == 1)
            }
        },
        handleClick(){
            var trans = this.currentDomainObject.transition + 1
            if (trans > 2){
                trans = 0
            }
            console.log(trans);
            openmct.objects.mutate(this.currentDomainObject, "transition", trans)
        },
    },
    mounted: function(){
        this.$nextTick(function (){
            this.subscribeToObject(this.currentDomainObject)
        })
    }
};
</script>


