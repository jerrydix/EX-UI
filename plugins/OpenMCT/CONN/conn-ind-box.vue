<template>
  <h1>Here is a child component!</h1>
  <ButtonCounter />
</template>

<script>
import ButtonCounter from './conn-indicator.vue'

export default {
  components: {
    ButtonCounter
  }
}
</script>