<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Sign In</h1>
      <form @submit.prevent="onSubmit">
        <input v-model="email" type="email" placeholder="Email" required />
        <input v-model="password" type="password" placeholder="Password" required />
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="loading">{{ loading ? 'Signing in...' : 'Sign In' }}</button>
      </form>
      <p class="auth-link">No account? <router-link to="/register">Register</router-link></p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth, setToken } from '../api/client';

export default defineComponent({
  setup() {
    const router = useRouter();
    const email = ref('');
    const password = ref('');
    const error = ref('');
    const loading = ref(false);

    const onSubmit = async () => {
      error.value = '';
      loading.value = true;
      try {
        const res = await auth.login(email.value, password.value);
        setToken(res.token);
        router.push('/');
      } catch (e: any) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    };

    return { email, password, error, loading, onSubmit };
  },
});
</script>
