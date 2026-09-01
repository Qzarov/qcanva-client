<template>
  <div class="landing">
    <header class="landing-header">
      <router-link to="/" class="landing-brand"><img class="brand-logo" src="/qcanva-logo.png" alt="QCanva" /><span>QCanva</span></router-link>
      <nav class="landing-nav" aria-label="Навигация"><a href="#features">Возможности</a><a href="#use-cases">Сценарии</a><a href="#agents">Для агентов</a><a href="#templates">Примеры</a></nav>
      <div class="landing-actions">
        <ThemeMenu class="public-theme-control" />
        <router-link v-if="isLoggedIn" :to="{ name: 'dashboard' }" class="landing-register">Дашборд</router-link>
        <template v-else><router-link to="/login" class="landing-login">Войти</router-link><router-link to="/register" class="landing-register">Начать бесплатно</router-link></template>
      </div>
    </header>

    <main>
      <section class="landing-hero">
        <div class="hero-copy">
          <div class="hero-kicker"><span></span> Пространство для идей, команды и AI</div>
          <h1>Собирайте мысли<br><em>в одну картину.</em></h1>
          <p>QCanva объединяет канвасы, документы и интерактивные объекты в <strong>единое рабочее пространство для людей и ИИ-агентов</strong>. Весь контекст проекта остаётся рядом.</p>
          <div class="hero-buttons"><router-link :to="isLoggedIn ? { name: 'dashboard' } : '/register'" class="hero-primary">{{ isLoggedIn ? 'Открыть дашборд' : 'Начать бесплатно' }} <span>→</span></router-link><a href="#use-cases" class="hero-secondary">Посмотреть живой пример ↘</a></div>
          <div class="hero-note"><span class="avatars"><i>Я</i><i>А</i><i>+</i></span> Один контекст для вашей команды, проекта и агентов</div>
        </div>
        <div ref="parallaxBoard" class="hero-visual" aria-label="Пример рабочего пространства QCanva">
          <div class="visual-toolbar"><img class="visual-logo" src="/qcanva-logo.png" alt="" /><span></span><span></span><span></span><b>Поделиться</b></div>
          <div class="canvas-grid"></div>
          <div class="canvas-card card-plan" data-depth="1.1"><small>ПЛАН</small><strong>Запуск проекта</strong><div><i></i><i></i><i></i></div></div>
          <div class="canvas-card card-note" data-depth=".8"><span>✦</span><strong>Идея</strong><p>Собрать всё важное в одном месте</p></div>
          <div class="canvas-card card-doc" data-depth=".7"><small>ДОКУМЕНТ</small><strong>Исследование</strong><p>Контекст, решения и ссылки для команды.</p></div>
          <svg class="canvas-lines" viewBox="0 0 600 410" fill="none" preserveAspectRatio="none"><path d="M215 164 C276 166 272 237 355 241"/><path d="M209 178 C250 251 154 284 143 304"/></svg>
          <div class="cursor cursor-one" data-depth="1.3"><b></b><span>Ярослав</span></div><div class="cursor cursor-two" data-depth=".9"><b></b><span>Анна</span></div>
          <div class="hero-ai-note" data-depth="1"><b>AI · обновлено</b><span>Сводка встречи добавлена к roadmap</span></div>
          <div class="hero-agent-pill"><i></i> qcanva-mcp connected</div>
        </div>
      </section>

      <section class="landing-formula" aria-label="Формула продукта"><span>Canvas</span><b>+</b><span>Documents</span><b>+</b><span>Interactive objects</span><b>+</b><em>AI</em></section>

      <section id="features" class="landing-features">
        <div class="section-intro"><span>ВОЗМОЖНОСТИ</span><h2>Не просто доска.<br>Рабочее пространство.</h2></div>
        <article><div class="feature-icon violet">⌘</div><h3>Бесконечные канвасы</h3><p>Связывайте идеи, файлы, изображения и вложенные канвасы на одной поверхности.</p></article>
        <article><div class="feature-icon coral">↗</div><h3>Документы рядом</h3><p>HTML-страницы и заметки живут рядом с канвасами, а не теряются в папках.</p></article>
        <article><div class="feature-icon mint">◌</div><h3>Работа вместе</h3><p>Совместное редактирование, доступы, история изменений и чат прямо на канвасе.</p></article>
        <article><div class="feature-icon violet">AI</div><h3>Люди + AI</h3><p>Агенты читают и обновляют тот же проектный контекст с теми же правами доступа.</p></article>
      </section>

      <section id="use-cases" class="landing-use-cases reveal">
        <div class="section-intro"><span>ОДНО ПРОСТРАНСТВО</span><h2>Очень разные задачи.</h2><p>QCanva не заставляет выбирать между whiteboard, документом и рабочим инструментом. Меняется задача — пространство остаётся.</p></div>
        <div class="use-layout">
          <div class="case-menu" role="tablist" aria-label="Сценарии использования">
            <button v-for="(item, key) in cases" :key="key" type="button" class="case-btn" :class="{ active: activeCase === key }" :data-case="key" role="tab" :aria-selected="activeCase === key" @click="activeCase = key"><b>{{ item.label }}</b><span>→</span></button>
            <p data-case-copy class="case-copy">{{ currentCase.copy }}</p>
          </div>
          <div class="case-stage" aria-live="polite">
            <div class="stage-label"><i></i><span data-stage-title>{{ currentCase.title }}</span></div>
            <div class="stage-canvas">
              <article v-for="(tile, index) in currentCase.tiles" :key="`${activeCase}-${index}`" class="case-tile" :class="`case-tile-${index + 1}`"><small>{{ tile[2] }}</small><h3>{{ tile[0] }}</h3><p>{{ tile[1] }}</p></article>
              <span class="stage-line stage-line-one"></span><span class="stage-line stage-line-two"></span>
            </div>
          </div>
        </div>
      </section>

      <section id="context" class="landing-context reveal">
        <div class="context-copy"><span>ВЕСЬ КОНТЕКСТ ПРОЕКТА</span><h2>Не ищите, где лежит решение.</h2><p>Идея, обсуждение, документ, файл и результат связаны прямо в пространстве. Новому участнику не нужен экскурсовод по пятнадцати вкладкам.</p><a href="#templates" class="text-cta">Посмотреть публичные пространства →</a></div>
        <div class="context-map" aria-label="Карта контекста проекта"><i class="map-line ml-one"></i><i class="map-line ml-two"></i><article class="context-node primary">Идея продукта<small>точка старта</small></article><article class="context-node mint-node">Research<small>12 источников</small></article><article class="context-node decision-node">Решения команды<small>обновлено сегодня</small></article><article class="context-node yellow-node">Прототип<small>interactive object</small></article><article class="context-node ai-node">AI summary<small>context synced</small></article></div>
      </section>

      <section id="workflow" class="landing-workflow"><div><span>ОДНО ПРОСТРАНСТВО</span><h2>От первой мысли<br>до готового результата.</h2><p>Создайте канвас, добавьте документы, пригласите участников и держите весь контекст проекта под рукой.</p><router-link to="/register" class="text-cta">Попробовать QCanva <b>→</b></router-link></div><ol><li><b>01</b><div><strong>Создайте</strong><p>Канвас, документ или интерактивный шаблон.</p></div></li><li><b>02</b><div><strong>Соберите контекст</strong><p>Соедините заметки, ссылки, картинки и файлы.</p></div></li><li><b>03</b><div><strong>Делайте вместе</strong><p>Откройте доступ команде и работайте в реальном времени.</p></div></li></ol></section>

      <section id="agents" class="landing-agents">
        <div class="agents-copy"><span>QCANVA MCP</span><h2>Работайте с пространством<br>через ИИ-агентов.</h2><p>Подключите QCanva к агенту по Model Context Protocol. Он сможет нативно читать, создавать и обновлять канвасы и документы — с теми же доступами, что есть у вас.</p><div class="agents-points"><div><b>↗</b><span>Находить нужный контекст в канвасах и документах</span></div><div><b>✦</b><span>Создавать материалы и раскладывать их по папкам</span></div><div><b>✓</b><span>Обновлять рабочее пространство по вашей задаче</span></div></div></div>
        <div class="agents-terminal" aria-label="Пример работы ИИ-агента с QCanva"><div class="terminal-head"><i></i><i></i><i></i><span>qcanva-mcp</span><b>connected</b></div><div class="terminal-body"><p><em>agent</em> Найди план запуска и обнови статус задач</p><p><em>qcanva</em> Нашёл канвас «Запуск проекта»</p><p><em>qcanva</em> Обновлены 4 карточки · создана заметка</p><div class="terminal-result"><span>✓</span><div><strong>Готово</strong><small>Изменения сохранены в QCanva</small></div></div></div></div>
      </section>

      <section id="templates" class="landing-templates reveal">
        <div class="section-intro"><span>ПОСМОТРИТЕ ДО РЕГИСТРАЦИИ</span><h2>Публичные пространства<br>и шаблоны.</h2><p>Откройте чужой canvas, исследуйте структуру и используйте как отправную точку для собственного проекта.</p></div>
        <div class="templates-grid">
          <router-link v-for="template in templatePreviews" :key="template.title" :to="isLoggedIn ? { name: 'dashboard' } : '/register'" class="template-preview-card"><div class="template-mini"><i></i><i></i><i></i></div><div><h3>{{ template.title }}</h3><p>{{ template.copy }}</p><b>↗</b></div></router-link>
        </div>
      </section>

      <section class="landing-final"><span>НАЧНИТЕ СЕЙЧАС</span><h2>Ваше следующее<br>пространство ждёт.</h2><router-link :to="isLoggedIn ? { name: 'dashboard' } : '/register'" class="hero-primary">{{ isLoggedIn ? 'Открыть дашборд' : 'Создать бесплатно' }} <span>→</span></router-link></section>
    </main>
    <footer class="landing-footer"><span>© {{ year }} QCanva</span><router-link :to="{ name: 'dashboard' }">Открыть дашборд</router-link></footer>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { isAuthenticated } from '../api/client';
import ThemeMenu from '../components/ThemeMenu.vue';

const cases = {
  product: { label: 'Product planning', title: 'Product planning · launch / Q4', copy: 'Roadmap, исследования, решения и задачи живут в одном пространстве — от первой идеи до релиза.', tiles: [['Запуск v2', 'MVP → beta → public', 'roadmap'], ['Research notes', 'Проблемы, инсайты, конкуренты', 'document'], ['One context', 'Проект без переключения вкладок', 'decision'], ['После созвона', '3 решения добавлены в roadmap', 'ai summary'], ['Prototype', 'owner · Ярослав', 'task']] },
  research: { label: 'Research', title: 'Research · market landscape', copy: 'Собирайте источники, заметки и выводы рядом, чтобы связь между фактами не терялась в папках.', tiles: [['Market map', '12 сегментов', 'landscape'], ['Primary sources', 'Интервью и ссылки', 'sources'], ['Key insight', 'Команды теряют контекст', 'insight'], ['AI synthesis', '7 тезисов из 18 заметок', 'ai summary'], ['Next step', 'Проверить гипотезу', 'task']] },
  knowledge: { label: 'Knowledge base', title: 'Knowledge base · product context', copy: 'Документы становятся частью пространственной базы знаний: их можно связывать с решениями, людьми и объектами.', tiles: [['Architecture', 'Сервисы и связи', 'map'], ['Team handbook', 'Процессы и правила', 'document'], ['Context map', 'Кто за что отвечает', 'context'], ['AI index', 'Контекст доступен агенту', 'ai summary'], ['Decision log', 'Почему сделали так', 'history']] },
  dnd: { label: 'D&D campaign', title: 'D&D campaign · Vallaki', copy: 'Карта мира, NPC, сцены, документы и интерактивные карточки могут быть одним мастерским пространством.', tiles: [['Vallaki map', 'Точки интереса', 'map'], ['NPC cards', 'Иреена · Измарк · Стража', 'characters'], ['Next scene', 'Ворота города', 'scene'], ['GM assistant', 'Сводка прошлой сессии', 'ai summary'], ['Encounter', 'Серые псы', 'task']] },
  workspace: { label: 'Project workspace', title: 'Project workspace · team hub', copy: 'Используйте QCanva как визуальный штаб проекта: цели, материалы, документы, обсуждения и живой статус рядом.', tiles: [['Quarter goals', '3 приоритета', 'goals'], ['Project docs', 'ТЗ · API · исследования', 'document'], ['Team hub', 'Все видят одну картину', 'context'], ['AI update', 'Статусы синхронизированы', 'ai summary'], ['Today', '2 задачи в работе', 'task']] },
} as const;

export default defineComponent({
  components: { ThemeMenu },
  setup() {
    const activeCase = ref<keyof typeof cases>('product');
    const parallaxBoard = ref<HTMLElement | null>(null);
    const currentCase = computed(() => cases[activeCase.value]);
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const onPointerMove = (event: PointerEvent) => {
      const board = parallaxBoard.value;
      if (!board || reducedMotion()) return;
      const rect = board.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
      const y = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
      board.querySelectorAll<HTMLElement>('[data-depth]').forEach((element) => {
        const depth = Number(element.dataset.depth || 1);
        element.style.transform = `translate(${x * 10 * depth}px, ${y * 10 * depth}px)`;
      });
    };
    const resetParallax = () => parallaxBoard.value?.querySelectorAll<HTMLElement>('[data-depth]').forEach((element) => { element.style.transform = ''; });
    let observer: IntersectionObserver | null = null;
    onMounted(() => {
      parallaxBoard.value?.addEventListener('pointermove', onPointerMove);
      parallaxBoard.value?.addEventListener('pointerleave', resetParallax);
      const reveals = document.querySelectorAll<HTMLElement>('.landing .reveal');
      if ('IntersectionObserver' in window && !reducedMotion()) {
        observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
          if (entry.isIntersecting) { (entry.target as HTMLElement).classList.add('in'); observer?.unobserve(entry.target); }
        }), { threshold: 0.12 });
        reveals.forEach((element) => observer?.observe(element));
      } else reveals.forEach((element) => element.classList.add('in'));
    });
    onBeforeUnmount(() => {
      parallaxBoard.value?.removeEventListener('pointermove', onPointerMove);
      parallaxBoard.value?.removeEventListener('pointerleave', resetParallax);
      observer?.disconnect();
    });
    return {
      activeCase,
      cases,
      currentCase,
      isLoggedIn: isAuthenticated(),
      parallaxBoard,
      templatePreviews: [
        { title: 'Product launch map', copy: 'Roadmap, исследования, решения и задачи.' },
        { title: 'Research workspace', copy: 'Источники, заметки и связанная аналитика.' },
        { title: 'D&D campaign board', copy: 'Карта, персонажи, сцены и заметки мастера.' },
      ],
      year: new Date().getFullYear(),
    };
  },
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;0,800;1,700;1,800&display=swap');
.landing{--ink:#191724;--muted:#746f80;--paper:#f7f5f0;--line:#ded9d4;--purple:#6658e8;min-height:100vh;background:var(--paper);color:var(--ink);font-family:Manrope,Arial,sans-serif}.landing-header{height:78px;max-width:1230px;padding:0 28px;margin:auto;display:flex;align-items:center;justify-content:space-between}.landing-brand{display:flex;gap:9px;align-items:center;color:var(--ink);font-weight:800;font-size:19px;text-decoration:none}.brand-mark{display:grid;place-items:center;width:27px;height:27px;background:var(--ink);border-radius:8px;color:#fff;font-family:'Playfair Display',serif;font-size:17px}.landing-nav{display:flex;gap:29px;margin-left:100px}.landing-nav a,.landing-login,.landing-footer a{font-size:13px;color:#5d5868;text-decoration:none}.landing-actions{display:flex;align-items:center;gap:19px}.landing-register{padding:10px 15px;border-radius:8px;color:#fff;background:var(--ink);font-size:13px;font-weight:700;text-decoration:none}.landing-hero{max-width:1174px;min-height:600px;margin:27px auto 88px;padding:52px 54px;display:grid;grid-template-columns:.88fr 1.12fr;gap:40px;box-sizing:border-box;border-radius:26px;background:#e9e5fc;overflow:hidden}.hero-copy{position:relative;z-index:2;align-self:center}.hero-kicker,.section-intro>span,.landing-workflow>div>span,.landing-final>span{display:flex;gap:7px;align-items:center;color:#625a82;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.12em}.hero-kicker span{width:7px;height:7px;border-radius:50%;background:#fe806b}.hero-copy h1{margin:18px 0 20px;font-size:52px;letter-spacing:-.06em;line-height:1.06}.hero-copy h1 em{font-family:'Playfair Display',serif;font-weight:700}.hero-copy p{max-width:430px;color:#635d75;font-size:15px;line-height:1.7}.hero-buttons{display:flex;gap:13px;flex-wrap:wrap;margin-top:29px;align-items:center}.hero-primary{display:inline-flex;gap:20px;align-items:center;padding:14px 17px;border-radius:9px;color:#fff;background:var(--ink);font-size:13px;font-weight:700;text-decoration:none}.hero-primary span{font-size:19px;line-height:.7}.hero-secondary{color:#484158;font-size:12px;font-weight:700;text-decoration:none}.hero-note{display:flex;align-items:center;gap:10px;margin-top:34px;color:#716b83;font-size:11px}.avatars{display:flex}.avatars i{display:grid;place-items:center;width:24px;height:24px;margin-right:-5px;border:2px solid #e9e5fc;border-radius:50%;font-style:normal;font-size:9px;background:#ffc8b8}.avatars i:nth-child(2){background:#b8e2d3}.avatars i:last-child{background:#fff;color:#716b83}.hero-visual{position:relative;min-height:420px;border-radius:16px;background:#252334;box-shadow:0 28px 55px rgba(61,49,115,.23);overflow:hidden;transform:rotate(2deg)}.visual-toolbar{position:absolute;z-index:3;inset:0 0 auto;height:42px;padding:0 13px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #48445a;background:#302d40}.visual-toolbar span:not(.visual-logo){width:16px;height:5px;border-radius:4px;background:#5c576e}.visual-toolbar b{margin-left:auto;padding:5px 8px;border-radius:5px;background:#7666e9;color:#fff;font-size:8px}.visual-logo{display:grid;place-items:center;width:19px;height:19px;border-radius:5px;background:#fff;color:#252334;font-family:serif;font-weight:bold}.canvas-grid{position:absolute;inset:42px 0 0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:24px 24px}.canvas-card{position:absolute;z-index:2;padding:14px;border-radius:9px;box-shadow:0 9px 20px #0003}.canvas-card small{display:block;margin-bottom:8px;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.12em}.canvas-card strong{display:block;font-size:14px}.canvas-card p{margin:8px 0 0;color:#5d566d;font-size:10px;line-height:1.4}.card-plan{top:91px;left:51px;width:144px;background:#fff6cf;color:#41391c}.card-plan div{display:flex;gap:4px;margin-top:14px}.card-plan i{width:20px;height:4px;border-radius:4px;background:#e8bc55}.card-note{top:222px;left:66px;width:118px;background:#efc4f2;color:#472d4b}.card-note span{display:block;margin-bottom:8px}.card-doc{top:168px;right:52px;width:145px;background:#e4f1ff}.canvas-lines{position:absolute;z-index:1;inset:42px 0 0;width:100%;height:calc(100% - 42px);stroke:#a99dff;stroke-width:2}.cursor{position:absolute;z-index:4;display:flex;align-items:center;gap:3px;color:#fff;font-size:8px}.cursor b{display:block;width:0;height:0;border-left:7px solid transparent;border-right:2px solid transparent;border-bottom:15px solid #ff8370;transform:rotate(-38deg)}.cursor span{padding:3px 5px;border-radius:4px;background:#ff8370}.cursor-one{top:182px;left:268px}.cursor-two{right:84px;bottom:86px}.cursor-two b{border-bottom-color:#63c5ad}.cursor-two span{background:#63c5ad}.landing-features{max-width:1120px;margin:0 auto 115px;padding:0 26px;display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:27px}.section-intro h2,.landing-workflow h2,.landing-final h2{margin:14px 0 0;font-size:33px;letter-spacing:-.05em;line-height:1.12}.landing-features article{padding:4px 0}.feature-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;font-size:19px}.violet{background:#e9e5fc;color:#6658e8}.coral{background:#ffe1d5;color:#e5775f}.mint{background:#d9f2ea;color:#35a080}.landing-features h3{margin:16px 0 8px;font-size:15px}.landing-features p{margin:0;color:var(--muted);font-size:12px;line-height:1.6}.landing-workflow{max-width:1120px;margin:0 auto 105px;padding:56px 62px;display:grid;grid-template-columns:1fr 1fr;gap:90px;border-radius:18px;background:#fff;border:1px solid var(--line)}.landing-workflow>div p{max-width:390px;color:var(--muted);font-size:13px;line-height:1.6}.text-cta{display:inline-flex;gap:12px;margin-top:14px;color:var(--purple);font-size:13px;font-weight:800;text-decoration:none}.landing-workflow ol{margin:5px 0;padding:0;list-style:none}.landing-workflow li{display:flex;gap:20px;padding:18px 0;border-bottom:1px solid #ebe7e2}.landing-workflow li:last-child{border:0}.landing-workflow li>b{color:#a49dac;font:11px 'DM Mono',monospace}.landing-workflow strong{font-size:14px}.landing-workflow li p{margin:4px 0 0;color:var(--muted);font-size:12px}.landing-final{max-width:1174px;margin:0 auto 44px;padding:65px;text-align:center;box-sizing:border-box;border-radius:23px;background:#22202d;color:#fff}.landing-final>span{justify-content:center;color:#a69ebd}.landing-final h2{margin:14px 0 26px;font-size:47px}.landing-final .hero-primary{background:#f4f1ea;color:#24222e}.landing-footer{max-width:1174px;padding:0 25px 32px;margin:auto;display:flex;justify-content:space-between;color:#8b8591;font-size:11px}@media(max-width:800px){.landing-header{height:66px;padding:0 18px}.landing-nav{display:none}.landing-login{display:none}.landing-hero{margin:10px 12px 60px;padding:37px 25px;grid-template-columns:1fr;min-height:0}.hero-copy h1{font-size:43px}.hero-visual{min-height:315px;margin-top:6px}.landing-features{grid-template-columns:1fr;margin-bottom:60px;padding:0 28px;gap:25px}.landing-workflow{margin:0 14px 65px;padding:35px 26px;grid-template-columns:1fr;gap:26px}.landing-final{margin:0 12px 30px;padding:48px 22px}.landing-final h2{font-size:39px}.landing-footer{padding:0 18px 25px}.card-doc{right:25px}.cursor-one{left:220px}}
</style>

<style scoped>
/* Keep the landing in the same Frox/QCanva visual system as the app. */
.landing {
  --ink: var(--dark-text-primary);
  --muted: var(--dark-text-muted);
  --paper: #0f0f12;
  --line: var(--dark-neutral-border);
  --purple: var(--color-brands);
  background: #0f0f12;
  font-family: 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overscroll-behavior-y: contain;
}
.landing-header { border-bottom: 1px solid var(--dark-neutral-border); }
.landing-brand { color: var(--dark-text-primary); }
.brand-logo { width: 30px; height: 30px; border-radius: 9px; object-fit: cover; }
.landing-nav a, .landing-login, .landing-footer a { color: var(--dark-text-secondary); }
.landing-register { color: var(--color-brand-on); background: var(--color-brands); border-radius: var(--radius-sm); }
.landing-hero { background: linear-gradient(135deg, rgba(0,42,0,.7), rgba(31,33,40,.98)); border: 1px solid var(--dark-neutral-border); border-radius: var(--radius-xl); }
.hero-kicker, .section-intro>span, .landing-workflow>div>span, .landing-final>span { color: var(--color-brands-light); font-family: inherit; font-weight: 700; }
.hero-kicker span { background: var(--color-brands); }
.hero-copy h1 { color: var(--dark-text-primary); letter-spacing: -.045em; }
.hero-copy h1 em { color: var(--color-brands); font-family: inherit; font-style: normal; }
.hero-copy p { color: var(--dark-text-secondary); }
.hero-primary { color: var(--color-brand-on); background: var(--color-brands); border-radius: var(--radius-sm); }
.hero-primary:hover, .landing-register:hover { background: var(--color-brands-light); }
.hero-secondary { color: var(--dark-text-primary); }
.hero-note { color: var(--dark-text-muted); }
.avatars i { border-color: #102010; color: var(--color-brand-on); background: var(--color-brands); }
.avatars i:nth-child(2) { background: var(--accent-green); }.avatars i:last-child { color: var(--dark-text-primary); background: var(--dark-neutral-bg); }
.hero-visual { border: 1px solid var(--dark-neutral-border); border-radius: var(--radius-lg); background: var(--dark-neutral-bg); box-shadow: var(--shadow-card); transform: rotate(0); }
.visual-toolbar { background: rgba(0,32,0,.84); border-bottom-color: var(--dark-neutral-border); }.visual-toolbar b { color: var(--color-brand-on); background: var(--color-brands); }.visual-logo { object-fit: cover; color: var(--color-brand-on); background: var(--color-brands); }
.card-plan { color: var(--dark-text-primary); background: rgba(0,42,0,.95); border: 1px solid #22502a; }.card-plan i { background: var(--color-brands); }
.card-note { color: #102515; background: var(--accent-green); }.card-doc { color: var(--dark-text-primary); background: #292d37; border: 1px solid #444958; }.canvas-card p { color: var(--dark-text-secondary); }.canvas-lines { stroke: var(--color-brands); opacity: .75; }
.landing-features article { padding: 20px; border: 1px solid var(--dark-neutral-border); border-radius: var(--radius-md); background: var(--dark-card-bg); }.section-intro { padding: 20px 0; }.feature-icon { color: var(--color-brand-on); background: var(--color-brands); }.coral { background: var(--accent-yellow); }.mint { background: var(--accent-green); }.landing-features h3 { color: var(--dark-text-primary); }.landing-features p { color: var(--dark-text-muted); }
.landing-features { grid-template-columns: repeat(4, 1fr); }.landing-features>.section-intro { grid-column: 1 / -1; display: flex; align-items: end; justify-content: space-between; gap: 32px; }.landing-features>.section-intro h2 { max-width: 650px; }
.landing-workflow { background: var(--dark-card-bg); border-color: var(--dark-neutral-border); border-radius: var(--radius-lg); }.landing-workflow>div p, .landing-workflow li p { color: var(--dark-text-muted); }.landing-workflow li { border-bottom-color: var(--dark-neutral-border); }.landing-workflow li>b { color: var(--color-brands); }.landing-workflow strong { color: var(--dark-text-primary); }.text-cta { color: var(--color-brands); }
.landing-final { background: linear-gradient(135deg, #003b09, #0f0f12); border: 1px solid #22502a; border-radius: var(--radius-xl); }.landing-final .hero-primary { background: var(--color-brands); color: var(--color-brand-on); }.landing-footer { color: var(--dark-text-muted); }
.landing-agents { max-width: 1120px; margin: 0 auto 105px; padding: 56px 62px; display: grid; grid-template-columns: 1fr 1fr; gap: 74px; align-items: center; box-sizing: border-box; border-radius: var(--radius-lg); background: #161a17; border: 1px solid #22502a; }
.agents-copy > span { color: #6ee89d; font-size: 10px; font-weight: 800; letter-spacing: .12em; }.agents-copy h2 { margin: 14px 0; font-size: 33px; letter-spacing: -.05em; line-height: 1.12; }.agents-copy > p { max-width: 470px; margin: 0; color: var(--dark-text-muted); font-size: 13px; line-height: 1.65; }
.agents-points { display: grid; gap: 11px; margin-top: 24px; }.agents-points div { display: flex; gap: 10px; align-items: center; color: var(--dark-text-secondary); font-size: 12px; }.agents-points b { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; color: #06250c; background: var(--accent-green); font-size: 12px; }
.agents-terminal { overflow: hidden; border: 1px solid #35413a; border-radius: 12px; background: #0d100e; box-shadow: 0 18px 40px #0004; }.terminal-head { display: flex; align-items: center; gap: 6px; height: 37px; padding: 0 12px; border-bottom: 1px solid #2d352f; background: #151a16; }.terminal-head i { width: 7px; height: 7px; border-radius: 50%; background: #606a62; }.terminal-head i:first-child { background: #f07061; }.terminal-head i:nth-child(2) { background: #e7bd5e; }.terminal-head i:nth-child(3) { background: #5fb97c; }.terminal-head span { margin-left: 5px; color: #b9c3bb; font: 10px 'DM Mono', monospace; }.terminal-head b { margin-left: auto; color: #6ee89d; font: 9px 'DM Mono', monospace; }.terminal-body { padding: 18px; font: 11px/1.55 'DM Mono', monospace; }.terminal-body p { margin: 0 0 12px; color: #cad3cc; }.terminal-body em { display: inline-block; width: 58px; color: #7cdb98; font-style: normal; }
.terminal-result { display: flex; gap: 10px; align-items: center; margin-top: 18px; padding: 11px; border-radius: 8px; background: #152d1b; }.terminal-result > span { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: #06250c; background: #6ee89d; font-weight: 800; }.terminal-result strong { display: block; color: #e5f3e8; font-size: 11px; }.terminal-result small { color: #91a895; font-size: 9px; }
.landing-formula { max-width: 1444px; min-height: 116px; margin: -45px auto 70px; padding: 0 28px; display: flex; align-items: center; justify-content: center; gap: 26px; border-top: 1px solid #202724; border-bottom: 1px solid #202724; color: #eef4ed; font-size: clamp(18px,2vw,28px); font-weight: 850; }.landing-formula b { color: #4f5f53; font-weight: 400; }.landing-formula em { color: #00ff00; font-style: normal; }
.hero-ai-note { position: absolute; z-index: 2; right: 38px; bottom: 48px; width: 190px; padding: 13px 15px; display: grid; gap: 4px; border: 1px solid rgba(0,255,0,.3); border-radius: 10px; background: #132019; font-size: 9px; }.hero-ai-note b { color: #00ff00; }.hero-ai-note span { color: #b9c8ba; }.hero-agent-pill { position: absolute; z-index: 2; left: 43%; bottom: 24px; padding: 7px 10px; display: flex; align-items: center; gap: 7px; border: 1px solid rgba(0,255,0,.24); border-radius: 999px; color: #b8c9bb; background: #0b160f; font-size: 8px; }.hero-agent-pill i { width: 6px; height: 6px; border-radius: 50%; background: #00ff00; box-shadow: 0 0 10px rgba(0,255,0,.65); }
.landing-use-cases,.landing-context,.landing-templates { max-width: 1120px; margin: 0 auto 105px; padding: 0 26px; box-sizing: border-box; }.landing-use-cases>.section-intro,.landing-templates>.section-intro { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; align-items: end; margin-bottom: 34px; }.landing-use-cases>.section-intro span,.landing-templates>.section-intro span,.context-copy>span { color: #00ff00; font-size: 10px; font-weight: 800; letter-spacing: .13em; }.landing-use-cases>.section-intro h2,.landing-templates>.section-intro h2,.context-copy h2 { margin: 8px 0 0; font-size: 38px; letter-spacing: -.05em; line-height: 1.05; }.landing-use-cases>.section-intro p,.landing-templates>.section-intro p,.context-copy p { margin: 0; color: #aab8aa; font-size: 13px; line-height: 1.65; }
.use-layout { display: grid; grid-template-columns: .72fr 1.28fr; gap: 18px; }.case-menu,.case-stage { border: 1px solid #334039; border-radius: 18px; background: #111512; }.case-menu { padding: 14px; }.case-btn { width: 100%; padding: 16px 15px; display: flex; justify-content: space-between; border: 0; border-bottom: 1px solid #26302b; color: #aab8aa; background: transparent; cursor: pointer; text-align: left; }.case-btn:last-of-type { border-bottom: 0; }.case-btn.active { border-radius: 10px; color: #001b00; background: #00ff00; }.case-copy { margin: 18px 8px 4px; min-height: 66px; color: #aab8aa; font-size: 12px; line-height: 1.55; }.case-stage { padding: 18px; overflow: hidden; }.stage-label { display: flex; align-items: center; gap: 8px; color: #cbd7cd; font-size: 11px; }.stage-label i { width: 7px; height: 7px; border-radius: 50%; background: #00ff00; }.stage-canvas { position: relative; min-height: 390px; margin-top: 15px; border-radius: 14px; background-color: #1a1e22; background-image: linear-gradient(#ffffff0b 1px,transparent 1px),linear-gradient(90deg,#ffffff0b 1px,transparent 1px); background-size: 28px 28px; }.case-tile { position: absolute; z-index: 2; width: 160px; padding: 15px; border: 1px solid #445049; border-radius: 11px; background: #072810; box-shadow: 0 8px 20px #0003; }.case-tile small { color: #8fa291; font-size: 8px; letter-spacing: .11em; text-transform: uppercase; }.case-tile h3 { margin: 9px 0 5px; font-size: 14px; }.case-tile p { margin: 0; color: #b9c8ba; font-size: 9px; }.case-tile-1 { left: 6%; top: 9%; }.case-tile-2 { right: 7%; top: 15%; background: #2b3038; }.case-tile-3 { left: 35%; top: 40%; background: #043c0c; }.case-tile-4 { right: 10%; bottom: 8%; }.case-tile-5 { left: 8%; bottom: 10%; background: #234636; }.stage-line { position: absolute; z-index: 1; height: 2px; background: #00ff00; opacity: .5; transform-origin: left; }.stage-line-one { width: 190px; left: 22%; top: 28%; transform: rotate(22deg); }.stage-line-two { width: 230px; left: 25%; bottom: 26%; transform: rotate(-13deg); }
.landing-context { padding: 48px; display: grid; grid-template-columns: .85fr 1.15fr; gap: 55px; align-items: center; border: 1px solid #22502a; border-radius: 18px; background: linear-gradient(135deg,#031607,#161a17); }.context-map { position: relative; min-height: 340px; }.context-node { position: absolute; z-index: 2; min-width: 145px; padding: 14px; display: grid; gap: 5px; border: 1px solid #405047; border-radius: 11px; background: #202622; font-size: 12px; }.context-node small { color: #99a99d; font-size: 9px; }.context-node.primary { left: 36%; top: 39%; color: #002400; background: #00ff00; }.context-node.primary small { color: #075c07; }.mint-node { left: 4%; top: 7%; background: #59d7bf; color: #073b31; }.decision-node { right: 0; top: 8%; }.yellow-node { left: 5%; bottom: 4%; background: #f4e65a; color: #3c3500; }.ai-node { right: 1%; bottom: 5%; }.map-line { position: absolute; z-index: 1; left: 24%; top: 31%; width: 270px; height: 2px; background: rgba(0,255,0,.45); transform: rotate(14deg); }.ml-two { top: 67%; transform: rotate(-14deg); }
.templates-grid { grid-column: 1/-1; display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; }.template-preview-card { overflow: hidden; border: 1px solid #334039; border-radius: 16px; color: #f4f7f3; background: #111512; text-decoration: none; transition: transform .2s ease,border-color .2s ease; }.template-preview-card:hover { transform: translateY(-4px); border-color: rgba(0,255,0,.45); }.template-mini { position: relative; min-height: 180px; background-color: #1a1e22; background-image: linear-gradient(#ffffff0a 1px,transparent 1px),linear-gradient(90deg,#ffffff0a 1px,transparent 1px); background-size: 24px 24px; }.template-mini i { position: absolute; width: 75px; height: 46px; border-radius: 8px; background: #043c0c; }.template-mini i:first-child { left: 12%; top: 20%; }.template-mini i:nth-child(2) { right: 12%; top: 36%; background: #59d7bf; }.template-mini i:last-child { left: 34%; bottom: 12%; background: #2b3038; }.template-preview-card>div:last-child { position: relative; padding: 18px; }.template-preview-card h3 { margin: 0 0 7px; font-size: 15px; }.template-preview-card p { margin: 0; color: #aab8aa; font-size: 11px; }.template-preview-card b { position: absolute; right: 18px; top: 18px; color: #00ff00; }
.reveal { opacity: 0; transform: translateY(18px); transition: opacity .6s ease,transform .6s ease; }.reveal.in { opacity: 1; transform: none; }
@media(max-width:800px) { .landing-header { border-bottom: 0; } .landing-features { grid-template-columns: 1fr; }.landing-features article { padding: 18px; } .landing-agents { margin: 0 14px 65px; padding: 35px 26px; grid-template-columns: 1fr; gap: 28px; } .agents-copy h2 { font-size: 30px; } .terminal-body { padding: 15px; font-size: 10px; } }
@media(max-width:800px) { .landing-formula { margin-top: -28px; gap: 9px; flex-wrap: wrap; font-size: 14px; }.landing-use-cases>.section-intro,.landing-templates>.section-intro,.use-layout,.landing-context { grid-template-columns: 1fr; }.landing-context { margin-inline: 14px; padding: 32px 24px; }.case-stage { padding: 12px; }.stage-canvas { min-height: 440px; }.case-tile { width: 132px; }.templates-grid { grid-template-columns: 1fr; }.context-map { min-height: 330px; }.landing-use-cases,.landing-templates { padding-inline: 14px; }.hero-ai-note { right: 22px; bottom: 36px; }.hero-agent-pill { left: 28%; } }
@media(prefers-reduced-motion:reduce) { .reveal { opacity: 1; transform: none; transition: none; }.canvas-card,.cursor,.hero-ai-note { transition: none; } }
</style>
