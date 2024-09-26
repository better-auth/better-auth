<script>
import "../app.css";
</script>

<div class="centered-container">
  <slot></slot>
</div>

<style>
  .centered-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh; /* Full viewport height */
  }
</style>
