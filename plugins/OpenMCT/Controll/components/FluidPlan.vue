<template>
    <h1 style="text-align: center">Fluid Plan</h1>
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
    },
    methods: {
    },
    mounted: function(){
        //this.$nextTick(function (){
        //    this.subscribeToObject(this.currentDomainObject)
        //})
    }
};
</script>


