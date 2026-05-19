<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Sign In</h1>
      <form @submit.prevent="onSubmit">
        <input v-model="login" type="text" placeholder="Email or access login" required />
        <input v-model="password" type="password" placeholder="Password" required />
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="loading">{{ loading ? 'Signing in...' : 'Sign In' }}</button>
      </form>
      <p class="auth-link"><router-link to="/">Go to Home</router-link></p>
      <p class="auth-link">No account? <router-link to="/register">Register</router-link></p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, setToken } from '../api/client';

export default defineComponent({
  setup() {
    const router = useRouter();
    const route = useRoute();
    const login = ref('');
    const password = ref('');
    const error = ref('');
    const loading = ref(false);

    const onSubmit = async () => {
      error.value = '';
      loading.value = true;
      try {
        const res = login.value.includes('@')
          ? await auth.login(login.value, password.value)
          : await auth.passwordAccessLogin(login.value, password.value);
        setToken(res.token, res.user?.role, res.user?.accessMode || 'user');
        router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/');
      } catch (e: any) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    };

    return { login, password, error, loading, onSubmit };
  },
});
</script>
