<template>
<div class="l-iframe abs">
    <iframe  allow="geolocation" :src="url"></iframe>
</div>
</template>

<script>
const sanitizeUrl = require("@braintree/sanitize-url").sanitizeUrl;

export default {
    inject: ['openmct', 'domainObject'],
    data: function () {
        return {
            currentDomainObject: this.domainObject
        };
    },
    computed: {
        url() {
            return sanitizeUrl(this.currentDomainObject.url);
        }
    }
};
</script>
