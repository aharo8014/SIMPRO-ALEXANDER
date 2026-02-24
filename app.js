const params = {
  demand: {
    3: { p1: 320, p2: 180, p3: 90 },
    5: { p1: 330, p2: 240, p3: 120 },
    7: { p1: 420, p2: 260, p3: 130 },
  },
  rates: {
    p1: { l1: 30, l2: 24, reject: 0.02 },
    p2: { l1: 22, l2: 18, reject: 0.04 },
    p3: { l1: 14, l2: 11, reject: 0.06 },
  },
  inventory: {
    p1: 220, p2: 140, p3: 70,
    mpA: 2800, mpB: 1500, add: 900, pack: 3200,
  }
};

const dailyGuide = {
  1: { p1: [135, 165], p2: [72, 92], p3: [30, 42], ot: [0, 1], preventive: [1, 3] },
  2: { p1: [155, 185], p2: [86, 105], p3: [34, 46], ot: [0.5, 1.5], preventive: [1, 3] },
  3: { p1: [148, 172], p2: [78, 96], p3: [30, 42], ot: [0.5, 2], preventive: [2, 4] },
  4: { p1: [166, 194], p2: [94, 114], p3: [38, 52], ot: [0.5, 1.5], preventive: [2, 5] },
  5: { p1: [175, 205], p2: [103, 126], p3: [44, 58], ot: [1, 2], preventive: [2, 4] },
  6: { p1: [192, 225], p2: [112, 138], p3: [48, 64], ot: [0, 1], preventive: [1, 3] },
  7: { p1: [200, 235], p2: [122, 150], p3: [52, 70], ot: [0.5, 2], preventive: [2, 5] },
};

const events = {
  1: 'Arranque: 2 operarios no dominan Línea 2 (−10% rendimiento en L2 si no entrenas).',
  2: 'Proveedor alerta retraso de Aditivo en pedidos normales (alto riesgo +1 día).',
  3: 'Entrega obligatoria + auditoría de calidad en P2.',
  4: 'Falla M5 por sobreuso: sin preventivo previo pierde 4h, con preventivo pierde 1h.',
  5: 'Entrega 2 con cambio de mezcla aplicado (P1-30, P2+20, P3+10).',
  6: 'Ausentismo + fatiga: si hubo horas extra 4+ días seguidos, eficiencia global −5%.',
  7: 'Entrega final + auditoría de cierre semanal y puntaje final.',
};

const state = {
  day: 1,
  trainedL2: 0,
  preventiveHistory: 0,
  urgentBuys: 0,
  overtimeStreak: 0,
  delayedArrivals: [],
  history: [],
  participant: '',
  totals: { cost: 0, good: 0, rejectPctSum: 0, compliancePts: 0, score: 0, deliveriesOnTime: 0 },
};

const $ = (id) => document.getElementById(id);

function renderOverview() {
  const inv = params.inventory;
  $('overviewCards').innerHTML = [
    ['Día actual', state.day],
    ['PT total', `${inv.p1 + inv.p2 + inv.p3} u`],
    ['MP-A / MP-B', `${inv.mpA.toFixed(0)} / ${inv.mpB.toFixed(0)} kg`],
    ['Aditivo / Empaque', `${inv.add.toFixed(0)} kg / ${inv.pack.toFixed(0)} u`],
    ['Compras urgentes', state.urgentBuys],
    ['Puntaje acumulado', state.totals.score.toFixed(1)],
  ].map(([k, v]) => `<article class="stat"><h4>${k}</h4><strong>${v}</strong></article>`).join('');
}

function rangeText(label, min, max, unit = 'u') {
  return `<article class="range-card"><b>${label}</b><br><span class="safe">Rango ideal: ${min} - ${max} ${unit}</span><br><span class="risk">Fuera de rango: penaliza eficiencia y costo</span></article>`;
}

function renderDay() {
  $('dayTitle').textContent = `Día ${state.day}`;
  $('eventText').textContent = events[state.day] || 'Semana cerrada';

  if (state.day <= 7) {
    const g = dailyGuide[state.day];
    $('ranges').innerHTML = [
      rangeText('P1', g.p1[0], g.p1[1]),
      rangeText('P2', g.p2[0], g.p2[1]),
      rangeText('P3', g.p3[0], g.p3[1]),
      rangeText('Horas extra', g.ot[0], g.ot[1], 'h'),
      rangeText('Preventivo', g.preventive[0], g.preventive[1], 'máq.'),
    ].join('');
  }

  if (state.day > 7) {
    $('decisionForm').hidden = true;
    $('ranges').hidden = true;
    $('finalPanel').hidden = false;
  }
}

function consumeRaw(good) {
  const useA = good.p1 * 0.9 + good.p2 * 1.1;
  const useB = good.p3 * 1.4;
  const useAdd = good.p1 * 0.1 + good.p2 * 0.2 + good.p3 * 0.3;
  const packs = good.p1 + good.p2 + good.p3;
  params.inventory.mpA -= useA;
  params.inventory.mpB -= useB;
  params.inventory.add -= useAdd;
  params.inventory.pack -= packs;
}

function productionCap(product, overtime, penalties) {
  const baseHours = 24 + overtime * 3;
  const l1 = params.rates[product].l1 * (1 - penalties);
  const l2 = params.rates[product].l2 * (1 - penalties);
  return Math.floor(Math.min(baseHours * l1, baseHours * l2));
}

function rangePenalty(value, [min, max]) {
  if (value < min) return (min - value) / min;
  if (value > max) return (value - max) / max;
  return 0;
}

function deliveryCheck(day) {
  const req = params.demand[day];
  if (!req) return { compliance: 100, penalty: 0, delivered: null };
  const inv = params.inventory;
  const delivered = {
    p1: Math.min(req.p1, inv.p1),
    p2: Math.min(req.p2, inv.p2),
    p3: Math.min(req.p3, inv.p3),
  };
  inv.p1 -= delivered.p1; inv.p2 -= delivered.p2; inv.p3 -= delivered.p3;
  const required = req.p1 + req.p2 + req.p3;
  const actual = delivered.p1 + delivered.p2 + delivered.p3;
  const short = required - actual;
  const compliance = (actual / required) * 100;
  const penalty = short > 0 ? short * 9 + 180 : 0;
  if (short === 0) state.totals.deliveriesOnTime += 1;
  return { compliance, penalty, delivered };
}

function closeDay(ev) {
  ev.preventDefault();
  const day = state.day;
  const target = { p1: +$('p1').value, p2: +$('p2').value, p3: +$('p3').value };
  const overtime = +$('overtime').value;
  const trained = +$('trained').value;
  const preventive = +$('preventive').value;
  const qualityP2 = $('qualityP2').value;
  const orderType = $('orderType').value;
  const orderQty = +$('orderQty').value;
  const guide = dailyGuide[day];

  state.trainedL2 += trained;
  if (overtime > 0) state.overtimeStreak += 1; else state.overtimeStreak = 0;
  state.preventiveHistory += preventive;

  let penaltyFactor = 0;
  penaltyFactor += rangePenalty(target.p1, guide.p1) * 0.2;
  penaltyFactor += rangePenalty(target.p2, guide.p2) * 0.25;
  penaltyFactor += rangePenalty(target.p3, guide.p3) * 0.3;
  penaltyFactor += rangePenalty(overtime, guide.ot) * 0.2;
  penaltyFactor += rangePenalty(preventive, guide.preventive) * 0.1;

  if (day === 1 && state.trainedL2 < 2) penaltyFactor += 0.1;
  if (day === 4 && state.preventiveHistory < 7) penaltyFactor += 0.17;
  if (day === 6 && state.overtimeStreak >= 4) penaltyFactor += 0.08;
  if (day === 6 && trained === 0) penaltyFactor += 0.04;

  if (orderType !== 'none' && orderQty > 0) {
    const baseCost = 2.2;
    let multiplier = 1;
    if (orderType === 'urgent') { multiplier = 1.2; state.urgentBuys += 1; params.inventory.add += orderQty; }
    else if (orderType === 'express') { multiplier = 1.1; state.delayedArrivals.push({ day: day + 1, qty: orderQty }); }
    else {
      const arrivalDay = day === 2 ? day + 3 : day + 2;
      state.delayedArrivals.push({ day: arrivalDay, qty: orderQty });
    }
    state.totals.cost += orderQty * baseCost * multiplier;
  }

  state.delayedArrivals.filter(a => a.day === day).forEach(a => { params.inventory.add += a.qty; });

  const good = {};
  const rejectRates = { p1: 0.02, p2: 0.04, p3: 0.06 };
  if (day === 3 && qualityP2 === 'low') { rejectRates.p2 += 0.02; state.totals.cost += 100; }
  if (day === 5 && target.p3 > guide.p3[1]) rejectRates.p3 += 0.03;
  if (qualityP2 === 'high') rejectRates.p2 = Math.max(0.02, rejectRates.p2 - 0.01);

  ['p1', 'p2', 'p3'].forEach((p) => {
    const cap = productionCap(p, overtime, penaltyFactor);
    const gross = Math.min(target[p], cap);
    good[p] = Math.floor(gross * (1 - rejectRates[p]));
    params.inventory[p] += good[p];
  });

  consumeRaw(good);
  const totalGood = good.p1 + good.p2 + good.p3;
  const rejectAvg = ((rejectRates.p1 + rejectRates.p2 + rejectRates.p3) / 3) * 100;

  const laborCost = (6 * 8 * 7) + (6 * overtime * 10) + trained * 30;
  const maintCost = preventive * 25;
  const qualityCost = qualityP2 === 'high' ? 80 : qualityP2 === 'medium' ? 60 : 35;
  const rangeCostPenalty = penaltyFactor * 180;
  const invCost = (params.inventory.p1 + params.inventory.p2 + params.inventory.p3) * 0.2;
  const mpInvCost = (params.inventory.mpA + params.inventory.mpB + params.inventory.add + params.inventory.pack) * 0.04;

  const delivery = deliveryCheck(day);
  const dayCost = laborCost + maintCost + qualityCost + rangeCostPenalty + invCost + mpInvCost + delivery.penalty;
  const unitCost = totalGood > 0 ? dayCost / totalGood : 0;

  const randomShock = ((day * 13) % 7) * 0.9;
  const efficiency = Math.max(45, 96 - penaltyFactor * 60 - randomShock - (overtime > 1.5 ? 4 : 0));

  const dayScore =
    (Math.min(delivery.compliance, 100) / 100) * 35 +
    (efficiency / 100) * 25 +
    Math.max(0, 22 - unitCost / 3.8) +
    Math.max(0, 10 - rejectAvg) +
    (params.inventory.add > 120 && params.inventory.add < 380 ? 8 : 4);

  state.totals.cost += dayCost;
  state.totals.good += totalGood;
  state.totals.rejectPctSum += rejectAvg;
  state.totals.compliancePts += delivery.compliance;
  state.totals.score += dayScore;

  state.history.push({
    day,
    event: events[day],
    good,
    delivery,
    efficiency,
    dayCost,
    rejectAvg,
    dayScore,
    decision: `OT ${overtime}h | Entrenados ${trained} | Preventivo ${preventive} | Pedido ${orderType}`,
    rangeGap: (penaltyFactor * 100).toFixed(1)
  });

  $('history').innerHTML = state.history.map(h => `
    <article class="log">
      <strong>Día ${h.day}</strong> · ${h.event}<br>
      Producción buena: P1 ${h.good.p1}, P2 ${h.good.p2}, P3 ${h.good.p3}<br>
      Cumplimiento: ${h.delivery.compliance.toFixed(1)}% · Eficiencia: ${h.efficiency.toFixed(1)}% · Costo: $${h.dayCost.toFixed(2)}<br>
      Brecha vs rango: ${h.rangeGap}% · Puntaje día: ${h.dayScore.toFixed(1)}<br>
      Decisión crítica: ${h.decision}
    </article>
  `).join('');

  state.day += 1;
  renderOverview();
  renderDay();

  if (state.day > 7) {
    const avgCompliance = state.totals.compliancePts / 7;
    const avgEff = state.history.reduce((a, b) => a + b.efficiency, 0) / 7;
    const avgReject = state.totals.rejectPctSum / 7;
    const avgUnit = state.totals.cost / Math.max(1, state.totals.good);
    let final = state.totals.score;
    if (avgCompliance >= 95) final += 50;
    if (avgReject < 4) final += 30;
    if (state.urgentBuys > 3) final -= 30;
    if (state.totals.deliveriesOnTime < 2) final -= 40;

    $('finalSummary').innerHTML = `
      <p><b>Cumplimiento acumulado:</b> ${avgCompliance.toFixed(2)}%</p>
      <p><b>Eficiencia promedio:</b> ${avgEff.toFixed(2)}%</p>
      <p><b>Costo total semanal:</b> $${state.totals.cost.toFixed(2)}</p>
      <p><b>Costo unitario promedio:</b> $${avgUnit.toFixed(2)} /u</p>
      <p><b>Rechazo promedio:</b> ${avgReject.toFixed(2)}%</p>
      <p><b>Compras urgentes:</b> ${state.urgentBuys}</p>
      <p><b>Inventario final PT:</b> P1 ${params.inventory.p1}, P2 ${params.inventory.p2}, P3 ${params.inventory.p3}</p>
      <p><b>Puntaje total:</b> ${final.toFixed(1)} pts</p>
      <p><b>Diagnóstico:</b> ${diagnostic(avgCompliance, avgEff, avgReject)}</p>
    `;
    state.finalKpi = { avgCompliance, avgEff, avgReject, avgUnit, final };
  }
}

function diagnostic(c, e, r) {
  if (c >= 95 && e >= 90 && r < 4) return 'Gestión balanceada: alta estabilidad operativa y bajo costo unitario.';
  if (c >= 90 && r >= 4) return 'Buen control de entregas, pero con brechas de calidad que elevan costos.';
  return 'Se requiere fortalecer planeación de capacidad, calidad e inventarios para cumplir con menor costo.';
}

function niceLevel(score) {
  if (score >= 630) return 'Excelente';
  if (score >= 540) return 'Bueno';
  if (score >= 460) return 'Regular';
  return 'Crítico';
}

function generatePdf() {
  const participant = $('participantName').value.trim();
  if (!participant) {
    $('finalMessage').textContent = 'Debes ingresar tu nombre o equipo antes de generar el PDF.';
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    $('finalMessage').textContent = 'No se pudo cargar jsPDF. Revisa la conexión para habilitar descarga de PDF.';
    return;
  }

  const doc = new jsPDF();
  const now = new Date();
  const fileName = `SIMPRO7_Reporte_${participant.replace(/\s+/g, '')}_${now.toISOString().slice(0, 10)}.pdf`;
  const level = niceLevel(state.finalKpi.final);

  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(229, 9, 20);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text('Reporte Final SIMPRO-7', 14, 14);
  doc.setFontSize(12);
  doc.text(`Participante/Equipo: ${participant}`, 14, 34);
  doc.text(`Fecha: ${now.toLocaleString()}`, 14, 42);
  doc.text(`Puntaje final: ${state.finalKpi.final.toFixed(1)} pts`, 14, 50);
  doc.setDrawColor(229, 9, 20);
  doc.roundedRect(14, 58, 182, 22, 3, 3);
  doc.setFontSize(14);
  doc.text(`Semáforo de desempeño: ${level}`, 18, 72);

  doc.addPage();
  doc.setFillColor(245, 245, 245);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(16);
  doc.text('Resumen Ejecutivo', 14, 18);
  doc.setDrawColor(220, 220, 220);
  doc.line(14, 21, 196, 21);
  doc.setFontSize(11);
  doc.text(`Cumplimiento acumulado: ${state.finalKpi.avgCompliance.toFixed(2)}%`, 14, 34);
  doc.text(`Eficiencia promedio: ${state.finalKpi.avgEff.toFixed(2)}%`, 14, 42);
  doc.text(`Costo total semanal: $${state.totals.cost.toFixed(2)}`, 14, 50);
  doc.text(`Costo unitario promedio: $${state.finalKpi.avgUnit.toFixed(2)}/u`, 14, 58);
  doc.text(`Rechazo promedio: ${state.finalKpi.avgReject.toFixed(2)}%`, 14, 66);
  doc.text(`Entregas cumplidas: ${state.totals.deliveriesOnTime}/3`, 14, 74);
  doc.text(`Diagnóstico automático: ${diagnostic(state.finalKpi.avgCompliance, state.finalKpi.avgEff, state.finalKpi.avgReject)}`, 14, 88, { maxWidth: 180 });

  doc.addPage();
  doc.setFontSize(16);
  doc.text('Resultados por día', 14, 18);
  let y = 28;
  state.history.forEach(h => {
    doc.setFontSize(10);
    doc.text(`Día ${h.day} | Buenas: P1 ${h.good.p1}, P2 ${h.good.p2}, P3 ${h.good.p3}`, 14, y);
    y += 6;
    doc.text(`Cumpl. ${h.delivery.compliance.toFixed(1)}% | Efic. ${h.efficiency.toFixed(1)}% | Costo $${h.dayCost.toFixed(0)} | Brecha ${h.rangeGap}%`, 14, y);
    y += 7;
    if (y > 276) { doc.addPage(); y = 20; }
  });

  doc.addPage();
  doc.setFontSize(16);
  doc.text('Análisis presupuestario y recomendaciones', 14, 18);
  doc.setFontSize(11);
  doc.text(`Compras urgentes: ${state.urgentBuys}`, 14, 32);
  doc.text(`Costo semanal ejecutado: $${state.totals.cost.toFixed(2)}`, 14, 40);
  doc.text(`Inventario final PT: P1 ${params.inventory.p1}, P2 ${params.inventory.p2}, P3 ${params.inventory.p3}`, 14, 48);
  doc.text('Recomendaciones de mejora:', 14, 62);
  doc.text('- Mantener producción dentro de rangos diarios para reducir brechas y sobrecostos.', 16, 70, { maxWidth: 180 });
  doc.text('- Reducir compras urgentes y estabilizar OT para proteger eficiencia en día 6.', 16, 78, { maxWidth: 180 });
  doc.text('- Aumentar calidad de P2 en días de auditoría para evitar penalizaciones.', 16, 86, { maxWidth: 180 });

  doc.save(fileName);
  $('downloadPdfBtn').hidden = false;
  $('finalMessage').textContent = `Simulación finalizada con éxito. Reporte PDF generado para ${participant}.`;
}

$('decisionForm').addEventListener('submit', closeDay);
$('finalizeBtn').addEventListener('click', generatePdf);
$('downloadPdfBtn').addEventListener('click', generatePdf);
renderOverview();
renderDay();
