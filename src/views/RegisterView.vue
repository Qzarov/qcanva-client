<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Canvas<span class="brand">.</span></h1>
      <form @submit.prevent="onSubmit">
        <input v-model="name" type="text" placeholder="Name" required />
        <input v-model="email" type="email" placeholder="Email" required />
        <input v-model="password" type="password" placeholder="Password (min 6)" required minlength="6" />
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="loading">{{ loading ? 'Creating...' : 'Create Account' }}</button>
      </form>
      <p class="auth-link"><router-link to="/">Go to Home</router-link></p>
      <p class="auth-link">Have an account? <router-link to="/login">Sign in</router-link></p>
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
    const name = ref('');
    const email = ref('');
    const password = ref('');
    const error = ref('');
    const loading = ref(false);

    const onSubmit = async () => {
      error.value = '';
      loading.value = true;
      try {
        const res = await auth.register(email.value, name.value, password.value);
        setToken(res.token, res.user?.role, res.user?.accessMode || 'user', res.user);
        router.push('/dashboard');
      } catch (e: any) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    };

    return { name, email, password, error, loading, onSubmit };
  },
});
</script>
