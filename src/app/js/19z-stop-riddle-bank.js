  // A deterministic multilingual bank: ten distinct puzzle forms, each with 100
  // parameterized variants. IDs are stable across languages and app sessions.
  const STOP_RIDDLE_STATE_KEY = 'fastingTracker.stopRiddleSelection.v1';
  const STOP_ACTIVITY_PUZZLES = (() => {
    const families = [
      {
        en: (n) => [`A sequence begins ${n}, ${n+2}, ${n+4}, ${n+6}. What is the next number?`, `The numbers increase by 2, so the next number is ${n+8}.`],
        bg: (n) => [`Поредицата започва с ${n}, ${n+2}, ${n+4}, ${n+6}. Кое е следващото число?`, `Числата се увеличават с 2, затова следващото е ${n+8}.`],
        es: (n) => [`Una serie comienza con ${n}, ${n+2}, ${n+4}, ${n+6}. ¿Cuál es el siguiente número?`, `Los números aumentan de 2 en 2, así que el siguiente es ${n+8}.`]
      },
      {
        en: (n) => [`A number is doubled, then ${n} is added. The result is ${3*n}. What was the original number?`, `The original number was ${n}: 2 × ${n} + ${n} = ${3*n}.`],
        bg: (n) => [`Удвояват едно число и прибавят ${n}. Получава се ${3*n}. Кое е първоначалното число?`, `Първоначалното число е ${n}: 2 × ${n} + ${n} = ${3*n}.`],
        es: (n) => [`Se duplica un número y se le suma ${n}. El resultado es ${3*n}. ¿Cuál era el número inicial?`, `El número inicial era ${n}: 2 × ${n} + ${n} = ${3*n}.`]
      },
      {
        en: (n) => [`I am thinking of a number. Add 7, multiply the result by 2, then subtract 14. You get ${2*n}. Which number did I think of?`, `It was ${n}. The +7 and −14 cancel after doubling: 2 × (${n} + 7) − 14 = ${2*n}.`],
        bg: (n) => [`Намислям си число. Прибавям 7, умножавам резултата по 2 и изваждам 14. Получавам ${2*n}. Кое число съм намислил?`, `Числото е ${n}: 2 × (${n} + 7) − 14 = ${2*n}.`],
        es: (n) => [`Pienso en un número. Sumo 7, multiplico el resultado por 2 y resto 14. Obtengo ${2*n}. ¿En qué número pensé?`, `Era ${n}: 2 × (${n} + 7) − 14 = ${2*n}.`]
      },
      {
        en: (n) => [`A square has sides of ${n} cm. What is its perimeter?`, `Its perimeter is ${4*n} cm: four sides of ${n} cm each.`],
        bg: (n) => [`Квадрат има страни с дължина ${n} см. Каква е обиколката му?`, `Обиколката е ${4*n} см: четири страни по ${n} см.`],
        es: (n) => [`Un cuadrado tiene lados de ${n} cm. ¿Cuál es su perímetro?`, `Su perímetro es ${4*n} cm: cuatro lados de ${n} cm.`]
      },
      {
        en: (n) => [`What is the difference between the squares of ${n+1} and ${n}?`, `(${n+1})² − ${n}² = ${2*n+1}.`],
        bg: (n) => [`Каква е разликата между квадратите на ${n+1} и ${n}?`, `(${n+1})² − ${n}² = ${2*n+1}.`],
        es: (n) => [`¿Cuál es la diferencia entre los cuadrados de ${n+1} y ${n}?`, `(${n+1})² − ${n}² = ${2*n+1}.`]
      },
      {
        en: (n) => [`Three equal boxes contain ${3*n} pencils altogether. How many pencils are in each box?`, `Each box contains ${n} pencils: ${3*n} ÷ 3 = ${n}.`],
        bg: (n) => [`В три еднакви кутии има общо ${3*n} молива. Колко молива има във всяка кутия?`, `Във всяка кутия има ${n} молива: ${3*n} ÷ 3 = ${n}.`],
        es: (n) => [`Tres cajas iguales contienen ${3*n} lápices en total. ¿Cuántos lápices hay en cada caja?`, `Cada caja contiene ${n} lápices: ${3*n} ÷ 3 = ${n}.`]
      },
      {
        en: (n) => [`A book has ${4*n} pages. You read one quarter of it. How many pages have you read?`, `You have read ${n} pages: ${4*n} ÷ 4 = ${n}.`],
        bg: (n) => [`Една книга има ${4*n} страници. Прочиташ една четвърт от нея. Колко страници си прочел?`, `Прочел си ${n} страници: ${4*n} ÷ 4 = ${n}.`],
        es: (n) => [`Un libro tiene ${4*n} páginas. Lees una cuarta parte. ¿Cuántas páginas has leído?`, `Has leído ${n} páginas: ${4*n} ÷ 4 = ${n}.`]
      },
      {
        en: (n) => [`A train travels ${5*n} kilometres in 5 equal hours. What is its average speed?`, `Its average speed is ${n} kilometres per hour: ${5*n} ÷ 5 = ${n}.`],
        bg: (n) => [`Влак изминава ${5*n} километра за 5 равни часа. Каква е средната му скорост?`, `Средната скорост е ${n} километра в час: ${5*n} ÷ 5 = ${n}.`],
        es: (n) => [`Un tren recorre ${5*n} kilómetros en 5 horas iguales. ¿Cuál es su velocidad media?`, `Su velocidad media es de ${n} kilómetros por hora: ${5*n} ÷ 5 = ${n}.`]
      },
      {
        en: (n) => [`You have ${2*n+1} apples and give away ${n}. How many apples remain?`, `You have ${n+1} apples left: ${2*n+1} − ${n} = ${n+1}.`],
        bg: (n) => [`Имаш ${2*n+1} ябълки и подаряваш ${n}. Колко ябълки ти остават?`, `Остават ти ${n+1} ябълки: ${2*n+1} − ${n} = ${n+1}.`],
        es: (n) => [`Tienes ${2*n+1} manzanas y regalas ${n}. ¿Cuántas te quedan?`, `Te quedan ${n+1} manzanas: ${2*n+1} − ${n} = ${n+1}.`]
      },
      {
        en: (n) => [`A family has ${n} adults. Each adult shakes hands with every other adult exactly once. How many handshakes take place?`, `There are ${n*(n-1)/2} handshakes: ${n} × (${n} − 1) ÷ 2.`],
        bg: (n) => [`В едно семейство има ${n} възрастни. Всеки се ръкува точно веднъж с всеки друг. Колко ръкостискания има?`, `Ръкостисканията са ${n*(n-1)/2}: ${n} × (${n} − 1) ÷ 2.`],
        es: (n) => [`En una familia hay ${n} adultos. Cada uno da la mano a todos los demás una sola vez. ¿Cuántos apretones de manos hay?`, `Hay ${n*(n-1)/2} apretones: ${n} × (${n} − 1) ÷ 2.`]
      }
    ];
    const bank = [];
    families.forEach((family, familyIndex) => {
      const limit = familyIndex === families.length - 1 ? 97 : 100;
      for (let n = 1; n <= limit; n++) {
        const id = familyIndex * 100 + n;
        bank.push({ id, en: family.en(n), bg: family.bg(n), es: family.es(n) });
      }
    });
    // Retain the three original word riddles in the expanded collection.
    bank.push(
      { id: 998, en: ['What gets wetter as it dries?', 'A towel.'], bg: ['Кое става по-мокро, докато суши?', 'Кърпата.'], es: ['¿Qué se moja más cuanto más seca?', 'Una toalla.'] },
      { id: 999, en: ['What has keys but no locks, space but no room, and you can enter but not go inside?', 'A keyboard.'], bg: ['Кое има клавиши, но няма ключалки, интервал, но няма стая, и можете да въвеждате в него, без да влизате вътре?', 'Клавиатурата.'], es: ['¿Qué tiene teclas pero no cerraduras, espacio pero no habitaciones, y permite entrar sin que puedas entrar dentro?', 'Un teclado.'] },
      { id: 1000, en: ['What can travel around the world while staying in one corner?', 'A postage stamp.'], bg: ['Кое може да обиколи света, оставайки в един ъгъл?', 'Пощенска марка.'], es: ['¿Qué puede viajar por todo el mundo sin salir de una esquina?', 'Un sello postal.'] }
    );
    return Object.freeze(bank);
  })();

  function loadStopRiddleState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STOP_RIDDLE_STATE_KEY) || '{}');
      const seen = Array.isArray(saved.seen) ? saved.seen.filter(id => Number.isInteger(id) && id >= 1 && id <= STOP_ACTIVITY_PUZZLES.length) : [];
      return { seen: [...new Set(seen)], lastId: Number.isInteger(saved.lastId) ? saved.lastId : null };
    } catch { return { seen: [], lastId: null }; }
  }

  function nextStopActivityPuzzle() {
    const state = loadStopRiddleState();
    let available = STOP_ACTIVITY_PUZZLES.filter(riddle => !state.seen.includes(riddle.id));
    if (!available.length) {
      available = STOP_ACTIVITY_PUZZLES.filter(riddle => riddle.id !== state.lastId);
      state.seen = [];
    }
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    const selected = available[0];
    state.seen.push(selected.id);
    state.lastId = selected.id;
    try { localStorage.setItem(STOP_RIDDLE_STATE_KEY, JSON.stringify(state)); } catch {}
    return selected;
  }

  function stopRiddleText(riddle, field) {
    const language = ['en','bg','es'].includes(uiLanguage()) ? uiLanguage() : 'en';
    return riddle?.[language]?.[field === 'answer' ? 1 : 0] || riddle?.en?.[field === 'answer' ? 1 : 0] || '';
  }
