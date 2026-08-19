(() => {
  const fmt = value => String(Number(value)).padStart(2, '0');
  const percent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;
  const money = value => `${new Intl.NumberFormat('vi-VN').format(Math.abs(Number(value || 0)))}K`;
  const signedMoney = value => `${Number(value || 0) >= 0 ? '+' : '-'}${money(value)}`;
  const el = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  let activeDistributionAxisId = null;
  let activeDistributionRecord = null;

  const legacyLabels = {
    groupDeficit: 'Thiếu tương đối ở nhóm dạng số',
    frequencyDeficit: 'Thiếu tần suất trong cửa sổ ngắn',
    gap: 'Khoảng vắng mặt so với nhịp riêng',
    chainConsensus: 'Đồng thuận từ dàn chuỗi đã khử trùng'
  };
  const v2Labels = {
    onlineModel: 'Ranker online regularized',
    groupResidual: 'Residual nhóm số khử tương quan',
    frequencyPosterior: 'Tần suất empirical-Bayes',
    gapHazard: 'Hazard gap làm mượt',
    chainConsensus: 'Đồng thuận chuỗi đã kiểm chứng'
  };

  function isV2(record) {
    return record?.modelVersion === 'probability-score-v2'
      || record?.scoreDefinition?.kind === 'online-calibrated-relative-ranking-v2';
  }

  function calibrationFor(record) {
    return record?.model?.calibration || record?.scoreDefinition?.calibration || null;
  }

  function text(value, fallback = '-') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function modelStatus(record) {
    const calibration = calibrationFor(record);
    if (!isV2(record)) {
      return {
        className: 'border-slate-200 bg-slate-50 text-slate-700',
        title: 'Snapshot legacy v1',
        detail: 'Dữ liệu này được phát hành trước score v2; chỉ giữ để đối chiếu snapshot cũ, không dùng để xác nhận mô hình mới.'
      };
    }
    if (calibration?.eligible) {
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        title: 'Đủ cổng calibration nội bộ',
        detail: 'Vẫn cần dương và vượt Wilson lower ở hai holdout độc lập trước khi được đưa vào phương án vận hành.'
      };
    }
    return {
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      title: 'Lane nghiên cứu, chưa đủ điều kiện áp dụng',
      detail: 'Điểm v2 chỉ được dùng để quan sát cho tới khi dữ liệu quá khứ độc lập đạt ngưỡng xác suất và lợi nhuận đã công bố trước.'
    };
  }

  function showDetail(row, record) {
    if (!row) return;
    const detail = el('number-detail');
    detail.classList.remove('hidden');
    if (!isV2(record)) {
      const groups = row.evidence?.groupSignals
        ?.map(group => `${group.label} (z thiếu ${group.deficitZ})`)
        .join('; ') || 'Chưa có tín hiệu nhóm nổi bật';
      detail.innerHTML = `<strong>Số ${fmt(row.number)} · hạng #${row.rank} · ${row.score}/100</strong><div class="mt-2 grid gap-1">Nhóm: ${text(row.components?.groupDeficit)} · Tần suất ngắn: ${text(row.components?.frequencyDeficit)} · Gap: ${text(row.components?.gap)} · Đồng thuận chuỗi: ${text(row.components?.chainConsensus)}</div><p class="mt-2 text-slate-600">${groups}</p>`;
      return;
    }

    const frequency = row.evidence?.frequency || {};
    const hazard = row.evidence?.gapHazard || {};
    const groups = row.evidence?.groupSignals
      ?.map(group => `${group.label} (residual z ${text(group.z, '0')})`)
      .join('; ') || 'Không có residual nhóm đủ mạnh sau khử tương quan.';
    const chainMethods = row.evidence?.chainMethods?.length
      ? row.evidence.chainMethods.join(', ')
      : 'Không có chuỗi nào đủ cỡ mẫu và edge để được tính vào số này.';
    detail.innerHTML = `
      <strong>Số ${fmt(row.number)} · hạng #${row.rank} · điểm tương đối ${row.score}/100</strong>
      <div class="mt-3 grid gap-2 text-slate-700 sm:grid-cols-2">
        <div>Online: <strong>${text(row.components?.onlineModel)}%</strong> · Nhóm: <strong>${text(row.components?.groupResidual)}%</strong></div>
        <div>Empirical-Bayes: <strong>${text(row.components?.frequencyPosterior)}%</strong> · Hazard: <strong>${text(row.components?.gapHazard)}%</strong></div>
        <div>Tần suất dài/ngắn: <strong>${text(frequency.longCount, '0')}/${text(frequency.shortCount, '0')}</strong></div>
        <div>Gap hiện tại: <strong>${text(hazard.currentGap, '0')} ngày</strong> · độ tin cậy hazard: <strong>${percent(hazard.reliability)}</strong></div>
      </div>
      <p class="mt-3 text-slate-600"><strong>Nhóm:</strong> ${groups}</p>
      <p class="mt-2 text-slate-600"><strong>Đồng thuận chuỗi:</strong> ${chainMethods}</p>`;
  }

  function renderCalibration(record) {
    const calibration = calibrationFor(record);
    const node = el('calibration-gate');
    const stage = el('model-stage');
    const status = modelStatus(record);
    stage.textContent = status.title;
    stage.className = `mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-extrabold ${status.className}`;

    if (!calibration) {
      node.innerHTML = `<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><strong>${status.title}</strong><p class="mt-1">${status.detail}</p></div>`;
      return false;
    }

    const eligible = Boolean(calibration.eligible);
    node.innerHTML = `
      <div class="rounded-xl border ${eligible ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'} p-4 text-sm ${eligible ? 'text-emerald-900' : 'text-amber-950'}">
        <div class="flex flex-wrap items-center justify-between gap-2"><strong>${status.title}</strong><span class="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold">${calibration.days || 0} ngày calibration</span></div>
        <p class="mt-2">${status.detail}</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <span>Hit rate: <strong>${percent(calibration.hitRate)}</strong></span>
          <span>Wilson lower: <strong>${percent(calibration.wilsonLower)}</strong></span>
          <span>Hòa vốn 30 số: <strong>${percent(calibration.breakEvenHitRate)}</strong></span>
          <span>Log loss: <strong>${Number(calibration.logLoss || 0).toFixed(3)}</strong> / uniform ${Number(calibration.uniformLogLoss || 0).toFixed(3)}</span>
        </div>
      </div>`;
    return eligible;
  }

  function renderGroups(record) {
    const groups = record.groupSignals || [];
    el('groups').innerHTML = groups.map(group => {
      const z = Number(group.residualZ ?? group.deficitZ ?? 0);
      const direction = group.direction || (z >= 0 ? 'cao hơn kỳ vọng' : 'thấp hơn kỳ vọng');
      return `<div class="flex items-center justify-between gap-4 p-4"><div><strong>${group.label}</strong><p class="text-sm text-slate-500">${group.size} số · ${direction}</p></div><strong class="${z >= 0 ? 'text-blue-700' : 'text-slate-600'}">z ${z.toFixed(3)}</strong></div>`;
    }).join('') || '<p class="p-5 text-slate-500">Chưa có tín hiệu nhóm độc lập đủ mạnh.</p>';
  }

  function signed(value, digits = 3) {
    const number = Number(value || 0);
    return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
  }

  function precisePercent(value, digits = 3) {
    return `${(Number(value || 0) * 100).toFixed(digits)}%`;
  }

  function renderDistributionExplorer(current) {
    activeDistributionRecord = current || null;
    const select = el('distribution-axis-select');
    const detail = el('distribution-axis-detail');
    const matrix = el('distribution-number-matrix');
    const axes = (current?.partitionSignals || []).filter(axis => Array.isArray(axis.categories) && axis.categories.length);

    if (!current) {
      select.innerHTML = '<option>Chưa có snapshot</option>';
      select.disabled = true;
      detail.innerHTML = '<p class="text-sm text-slate-500">Chưa có dữ liệu phân bổ để dựng biểu đồ.</p>';
      matrix.innerHTML = '';
      return;
    }

    select.disabled = axes.length === 0;
    if (!activeDistributionAxisId || !axes.some(axis => axis.id === activeDistributionAxisId)) {
      activeDistributionAxisId = axes[0]?.id || null;
    }
    select.innerHTML = axes.length
      ? axes.map(axis => `<option value="${escapeHtml(axis.id)}" ${axis.id === activeDistributionAxisId ? 'selected' : ''}>${escapeHtml(axis.label)}</option>`).join('')
      : '<option>Đang chờ cache v4</option>';

    const activeAxis = axes.find(axis => axis.id === activeDistributionAxisId) || null;
    if (!activeAxis) {
      detail.innerHTML = '<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Snapshot hiện tại chưa có ma trận category v4.</strong><p class="mt-1">Dàn đã phát hành vẫn giữ nguyên. Action kế tiếp sẽ sinh phần diễn giải lịch sử–90 ngày–dự báo mà không tính lại các dàn cũ.</p></div>';
    } else {
      const rows = activeAxis.categories.map(category => {
        const historical = Number(category.historicalProbability || 0);
        const recent = Number(category.recentProbability || 0);
        const forecast = Number(category.forecastProbability || category.contextProbability || 0);
        const delta = forecast - historical;
        const maxProbability = Math.max(historical, recent, forecast, 0.000001);
        const width = value => Math.max(1, Math.min(100, Number(value || 0) / maxProbability * 100));
        return `<div class="grid gap-2 border-t border-slate-100 py-3 first:border-t-0 lg:grid-cols-[minmax(120px,1fr)_1.2fr_1.2fr_1.2fr_auto] lg:items-center"><div><strong class="text-sm text-slate-900">${escapeHtml(category.label)}</strong><p class="mt-0.5 text-xs text-slate-500">${category.size || 0} số · mẫu ${category.historicalCount || 0}</p></div><div><div class="flex justify-between gap-2 text-[11px] text-slate-500"><span>Lịch sử</span><strong>${precisePercent(historical)}</strong></div><div class="distribution-bar mt-1"><span class="bg-slate-400" style="width:${width(historical)}%"></span></div></div><div><div class="flex justify-between gap-2 text-[11px] text-slate-500"><span>${activeAxis.recentWindowSize || 0} ngày</span><strong>${precisePercent(recent)}</strong></div><div class="distribution-bar mt-1"><span class="bg-cyan-500" style="width:${width(recent)}%"></span></div></div><div><div class="flex justify-between gap-2 text-[11px] text-slate-500"><span>Dự báo</span><strong>${precisePercent(forecast)}</strong></div><div class="distribution-bar mt-1"><span class="bg-emerald-500" style="width:${width(forecast)}%"></span></div></div><span class="justify-self-start rounded-md px-2 py-1 text-xs font-black ${delta >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">${delta >= 0 ? '+' : ''}${precisePercent(delta)}</span></div>`;
      }).join('');
      detail.innerHTML = `<div class="flex flex-wrap items-start justify-between gap-3"><div><h4 class="font-bold text-slate-900">${escapeHtml(activeAxis.label)}</h4><p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(activeAxis.description)}</p></div><span class="rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-black text-cyan-800">${escapeHtml(activeAxis.lastCategory || 'Chưa có trạng thái')}</span></div><div class="mt-3 grid gap-2 text-xs sm:grid-cols-4"><p class="rounded-md bg-white p-2">Họ: <strong>${escapeHtml(activeAxis.family || 'general')}</strong></p><p class="rounded-md bg-white p-2">Mẫu chuyển: <strong>${activeAxis.activeTransitionSample || 0}</strong></p><p class="rounded-md bg-white p-2">Mẫu ngữ cảnh: <strong>${activeAxis.activeContextEvaluations || 0}</strong></p><p class="rounded-md bg-white p-2">Reliability tổng: <strong>${precisePercent(Number(activeAxis.transitionReliability || 0) + Number(activeAxis.contextReliability || 0) + Number(activeAxis.residualReliability || 0), 2)}</strong></p></div><div class="mt-4">${rows}</div><p class="mt-3 text-xs leading-5 text-slate-500">Chênh lệch bên phải là dự báo nhóm trừ tỷ lệ lịch sử. Dự báo đã co rút về nền và chỉ có ảnh hưởng khi log-lift prequential của đúng trạng thái hiện tại dương.</p>`;
    }

    const ranked = (current.rankedNumbers || []).slice().sort((left, right) => Number(left.number) - Number(right.number));
    matrix.innerHTML = ranked.map(row => {
      const percentile = Number(row.rankPercentile ?? row.score / 100 ?? 0);
      const strength = Math.max(0, Math.min(1, percentile));
      const background = `rgba(5,150,105,${(0.08 + strength * 0.82).toFixed(3)})`;
      const color = strength >= 0.62 ? '#ffffff' : '#17324d';
      const evidence = (row.evidence || []).slice(0, 4).map(item => `${item.partition}: ${item.category} (${Number(item.contribution || 0) >= 0 ? '+' : ''}${Number(item.contribution || 0).toFixed(4)})`).join(' · ');
      return `<button type="button" data-distribution-number="${row.number}" title="${escapeHtml(`${fmt(row.number)} · hạng #${row.rank} · ${evidence || 'không có trục đủ reliability'}`)}" class="probability-cell flex items-center justify-center rounded-md border border-white/70 font-mono font-black shadow-sm transition hover:-translate-y-0.5 hover:ring-2 hover:ring-cyan-400" style="background:${background};color:${color}">${fmt(row.number)}</button>`;
    }).join('') || '<p class="col-span-10 text-sm text-slate-500">Snapshot chưa lưu ma trận 100 số.</p>';
  }

  function renderDistribution(recordPayload) {
    const distribution = recordPayload.distribution;
    const statusNode = el('distribution-status');
    const signalsNode = el('distribution-signals');
    const researchNode = el('distribution-research');
    if (!distribution) {
      statusNode.innerHTML = '<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><strong>Chưa có snapshot phân bổ nhóm.</strong><p class="mt-1">Action hằng ngày chỉ sinh snapshot nhanh. Báo cáo strict PIT 20 năm là tác vụ nghiên cứu riêng để không làm chậm việc phát hành dàn đã chốt.</p></div>';
      signalsNode.innerHTML = '';
      researchNode.innerHTML = '<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><strong>Chưa có báo cáo strict PIT.</strong><p class="mt-1">Khi cache nghiên cứu được sinh từ raw R2, phần này sẽ hiển thị validation, holdout và ma trận tính bổ sung giữa các phương pháp.</p></div>';
      renderDistributionExplorer(null);
      return;
    }

    const current = distribution.record || null;
    const summary = distribution.summary || {};
    const currentStatus = current
      ? current.abstained
        ? `<strong>Không phát dàn phân bổ cho ${text(current.predictionDate)}</strong><p class="mt-1">Trạng thái nhóm hiện tại chưa có trục nào đạt lift prequential đủ mạnh. Đây là kết quả hợp lệ của cổng an toàn, không phải dàn 00–29 mặc định.</p><p class="mt-1 text-xs">Dùng raw đến ${text(current.sourceDataThrough)} · reliability ${Number(current.aggregateReliability || 0).toFixed(3)} · spread ${Number(current.scoreSpread || 0).toFixed(4)} · ${current.strictPointInTime ? 'strict point-in-time' : 'thiếu cờ PIT'}</p>`
        : `<strong>Snapshot ${current.settled ? 'đã kết toán' : 'đã khóa chờ kết quả'} cho ${text(current.predictionDate)}</strong><p class="mt-1">Dùng raw đến ${text(current.sourceDataThrough)} · ${current.topNumbers?.length || 0} số nghiên cứu · ${current.strictPointInTime ? 'strict point-in-time' : 'thiếu cờ PIT'}</p>`
      : '<strong>Cache phân bổ nhóm chưa có snapshot hiện tại.</strong>';
    statusNode.innerHTML = `<div class="flex flex-wrap items-start justify-between gap-4"><div class="text-slate-700">${currentStatus}</div><div class="text-right text-xs text-slate-500"><p>${summary.settledDays || 0} kỳ đã kết toán · ${percent(summary.hitRate)} trúng</p><p class="mt-1 ${Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'} font-bold">${signedMoney(summary.profitK)}</p></div></div>`;

    const axes = current?.partitionSignals || [];
    signalsNode.innerHTML = axes.map(axis => {
      const transitions = (axis.topTransitions || []).map(item => `<li class="flex items-center justify-between gap-2"><span class="truncate">${text(item.label)}</span><span class="shrink-0 font-bold ${Number(item.transitionLogLift || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">1 bước ${signed(item.transitionLogLift, 3)} · 2 bước ${signed(item.contextLogLift, 3)} · z ${signed(item.residualZ, 2)}</span></li>`).join('');
      return `<article class="rounded-xl border border-cyan-100 bg-slate-50/60 p-4"><div class="flex items-start justify-between gap-3"><div><h3 class="font-bold text-slate-900">${text(axis.label)}</h3><p class="mt-1 text-xs leading-5 text-slate-500">${text(axis.description)}</p></div><span class="rounded-md bg-cyan-100 px-2 py-1 text-xs font-black text-cyan-900">${text(axis.lastCategory, 'Chưa có')}</span></div><div class="mt-3 grid grid-cols-3 gap-2 text-xs"><div class="rounded-md bg-white p-2"><p class="text-slate-500">1 bước</p><strong class="mt-1 block text-slate-900">${percent(axis.transitionReliability)}</strong></div><div class="rounded-md bg-white p-2"><p class="text-slate-500">2 trạng thái</p><strong class="mt-1 block text-slate-900">${percent(axis.contextReliability)}</strong></div><div class="rounded-md bg-white p-2"><p class="text-slate-500">Residual</p><strong class="mt-1 block text-slate-900">${percent(axis.residualReliability)}</strong></div></div><p class="mt-2 text-xs text-slate-500">Ngữ cảnh 2 trạng thái: ${text(axis.activeContextLabel, 'chưa đủ')} · ${axis.activeContextEvaluations || 0} lần kiểm chứng</p><p class="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Nhóm kế tiếp có lift cao</p><ul class="mt-2 space-y-1.5 text-xs text-slate-600">${transitions || '<li>Chưa đủ quan sát.</li>'}</ul></article>`;
    }).join('') || '<p class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Snapshot hiện tại chưa lưu chi tiết các trục phân bổ.</p>';
    renderDistributionExplorer(current);

    const research = distribution.research;
    if (!research?.methods?.length) {
      researchNode.innerHTML = '<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><strong>Chưa có báo cáo strict PIT 20 năm.</strong><p class="mt-1">Snapshot hằng ngày bên trên vẫn độc lập và bất biến. Báo cáo dài hạn sẽ chỉ được sử dụng để so sánh mô hình, không tự thay đổi dàn đang theo dõi.</p></div>';
      return;
    }

    const methodLabels = Object.fromEntries(research.methods.map(method => [method.id, method.label]));
    const recommendation = research.recommendation || {};
    const methodCards = research.methods.map(method => {
      const validation = method.splits?.validation || {};
      const holdout = method.splits?.holdout || {};
      const promoted = Boolean(method.promoted);
      const coverage = method.coverage || {};
      return `<article class="rounded-xl border ${promoted ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'} p-4"><div class="flex items-start justify-between gap-3"><div><h3 class="font-bold text-slate-900">${text(method.label)}</h3><p class="mt-1 min-h-10 text-xs leading-5 text-slate-500">${text(method.description)}</p></div><span class="rounded-md px-2 py-1 text-xs font-black ${promoted ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-100 text-slate-700'}">${promoted ? 'Qua cổng' : 'Nghiên cứu'}</span></div><p class="mt-3 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">Phát dàn ${coverage.issuedDays || 0}/${coverage.candidateDays || 0} kỳ (${percent(coverage.coverageRate)}) · bỏ qua ${coverage.abstainedDays || 0} kỳ khi không đủ bằng chứng.</p><div class="mt-4 grid grid-cols-2 gap-2 text-xs"><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Validation</p><strong class="mt-1 block text-slate-900">${validation.wins || 0}/${validation.days || 0} · ${percent(validation.hitRate)}</strong><span class="${Number(validation.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signedMoney(validation.profitK)}</span></div><div class="rounded-md bg-slate-50 p-2"><p class="text-slate-500">Holdout</p><strong class="mt-1 block text-slate-900">${holdout.wins || 0}/${holdout.days || 0} · ${percent(holdout.hitRate)}</strong><span class="${Number(holdout.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${signedMoney(holdout.profitK)}</span></div></div><p class="mt-3 text-xs text-slate-500">Wilson holdout ${percent(holdout.wilsonLower)} · hòa vốn ${percent(holdout.breakEvenHitRate || research.economics?.breakEvenHitRate)}</p></article>`;
    }).join('');
    const pairRows = (research.complementarity || []).slice(0, 5).map(pair => {
      const total = Math.max(1, Number(pair.days || 0));
      const segments = [
        ['Cùng trúng', pair.bothHit || 0, 'bg-emerald-500'],
        ['Chỉ trái', pair.onlyLeft || 0, 'bg-sky-500'],
        ['Chỉ phải', pair.onlyRight || 0, 'bg-violet-500'],
        ['Cùng trượt', pair.neither || 0, 'bg-rose-400']
      ];
      const bar = segments.map(([, count, className]) => `<span class="${className}" style="width:${Number(count) / total * 100}%"></span>`).join('');
      return `<div class="rounded-md border border-violet-100 bg-white px-3 py-3 text-xs"><div class="grid grid-cols-[1fr_auto] items-start gap-3"><div><strong class="text-slate-900">${text(methodLabels[pair.leftId] || pair.leftId)} ↔ ${text(methodLabels[pair.rightId] || pair.rightId)}</strong><p class="mt-1 text-slate-500">${pair.days || 0} ngày cùng snapshot · trùng dàn TB ${Number(pair.averageOverlap || 0).toFixed(1)}/30</p></div><div class="text-right"><strong class="text-violet-800">Phủ ${percent(pair.unionHitRate)}</strong><p class="mt-1 text-slate-500">Wilson ${percent(pair.unionWilsonLower)}</p></div></div><div class="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">${bar}</div><div class="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-500 sm:grid-cols-4">${segments.map(([label, count]) => `<span>${label}: <strong class="text-slate-800">${count}</strong></span>`).join('')}</div></div>`;
    }).join('') || '<p class="text-sm text-slate-500">Chưa có cặp dàn cùng ngày để đo tính bổ sung.</p>';
    researchNode.innerHTML = `<div class="rounded-xl border ${research.strictPointInTime ? 'border-violet-200 bg-violet-50' : 'border-rose-200 bg-rose-50'} p-4"><div class="flex flex-wrap items-start justify-between gap-3"><div><strong class="text-slate-900">${text(recommendation.status)}</strong><p class="mt-1 text-sm leading-6 text-slate-600">${text(recommendation.promotionGate)}</p></div><span class="rounded-md bg-white px-3 py-2 text-xs font-black text-violet-800">${research.strictPointInTime ? 'Strict PIT' : 'Không đủ PIT'}</span></div><p class="mt-3 text-xs text-slate-500">Raw ${research.source?.dataStart || '-'} đến ${research.source?.dataEnd || '-'} · ${research.source?.rawRows || 0} kỳ · ${research.generatedAt ? `sinh ${new Date(research.generatedAt).toLocaleString('vi-VN')}` : 'chưa có thời gian sinh'}</p></div><div class="mt-5 grid gap-4 xl:grid-cols-2">${methodCards}</div><div class="mt-5"><h3 class="text-sm font-bold uppercase tracking-wide text-slate-600">Ma trận bổ sung giữa các dàn</h3><p class="mt-1 text-xs leading-5 text-slate-500">Bốn màu tách cùng trúng, chỉ phương pháp trái trúng, chỉ phương pháp phải trúng và cùng trượt. Việc hai dàn trúng đan xen chỉ được dùng để đặt giả thuyết; không tự chuyển phương pháp theo ngày gần nhất nếu cận Wilson của quy tắc chuyển chưa vượt hòa vốn.</p><div class="mt-3 space-y-2">${pairRows}</div></div>`;
  }

  function render(recordPayload) {
    const latest = recordPayload.records?.at(-1);
    if (!latest) throw new Error('Cache chưa có snapshot.');
    const definition = latest.scoreDefinition || {};
    const eligible = renderCalibration(latest);
    const status = modelStatus(latest);
    const labels = isV2(latest) ? v2Labels : legacyLabels;
    el('prediction-date').textContent = latest.predictionDate || '-';
    el('source-date').textContent = `Dữ liệu đến ${latest.sourceDataThrough || '-'}`;
    el('bet-count').textContent = `${latest.topNumbers?.length || 0} số`;
    el('group-window').textContent = `${definition.windows?.groupDeficit || '-'} ngày`;
    el('chain-count').textContent = `${definition.chainMethodCount || 0} dàn`;
    el('model-version').textContent = isV2(latest) ? 'Score v2 · online' : 'Score v1 · legacy';
    const legacyExcluded = Number(recordPayload.summary?.legacyRecordsExcluded || 0);
    const legacyNote = legacyExcluded > 0
      ? `<p class="mt-1 text-xs text-slate-500">${legacyExcluded} snapshot v1 legacy vẫn giữ để đối chiếu nhưng được loại khỏi tổng hợp hiệu quả của v2.</p>`
      : '';
    el('status').innerHTML = `<strong class="${latest.settled ? 'text-emerald-700' : 'text-blue-700'}">Snapshot ${latest.settled ? 'đã kết toán' : 'đang chờ kết quả'}</strong><span class="ml-2">${definition.warning || ''}</span><p class="mt-2 text-sm ${status.className.split(' ').at(-1)}">${status.title}: ${status.detail}</p>${legacyNote}`;
    el('top-title').textContent = eligible ? 'Dàn số ứng viên' : 'Dàn số nghiên cứu';
    el('top-description').textContent = eligible
      ? 'Các số xếp hạng cao nhất; vẫn phải được xác nhận trên các holdout độc lập trước khi áp dụng vận hành.'
      : 'Dàn này dùng để theo dõi calibration. Chưa được cộng vào gợi ý hoặc thay thế phương pháp Đề đang vận hành.';
    el('top-numbers').innerHTML = (latest.topNumbers || []).map(row => `<button data-number="${row.number}" class="num grade-${String(row.band || 'c').toLowerCase()} rounded-lg border px-3 py-2 text-center font-extrabold transition hover:-translate-y-0.5"><span class="block text-xl">${fmt(row.number)}</span><span class="text-xs">${row.score}</span></button>`).join('');
    el('top-numbers').querySelectorAll('button').forEach(button => button.addEventListener('click', () => showDetail((latest.rankedNumbers || []).find(row => row.number === Number(button.dataset.number)), latest)));
    el('weights').innerHTML = Object.entries(definition.weights || {}).filter(([, value]) => value > 0).map(([key, value]) => `<div class="flex items-center justify-between gap-3"><span>${labels[key] || key}</span><strong>${Math.round(value * 100)}%</strong></div>`).join('') || '<p class="text-slate-500">Snapshot này chưa có metadata trọng số.</p>';
    renderGroups(latest);
    renderDistribution(recordPayload);

    const summary = recordPayload.summary || {};
    const profitClass = Number(summary.profitK || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700';
    const cards = [
      ['NGÀY THEO DÕI', `${summary.trackedDays || 0}`, `${summary.settledDays || 0} đã kết toán · ${summary.pendingDays || 0} chờ`],
      ['THẮNG / THUA', `${summary.wins || 0} / ${summary.losses || 0}`, 'Theo dàn 30 số đã khóa'],
      ['TỶ LỆ TRÚNG', percent(summary.hitRate), `Hòa vốn ${percent(summary.breakEvenHitRate)}`],
      ['TỔNG VỐN', money(summary.stakeK), '1.000K mỗi số / ngày'],
      ['TỔNG NHẬN', money(summary.payoutK), '84 lần khi Đề vào dàn'],
      ['LÃI / LỖ', `${Number(summary.profitK || 0) >= 0 ? '+' : '-'}${money(summary.profitK)}`, `${percent(summary.roi)} ROI`]
    ];
    el('performance-summary').innerHTML = cards.map(([label, value, note], index) => `<div class="rounded-xl border border-slate-100 bg-slate-50 p-4"><p class="text-xs font-bold text-slate-500">${label}</p><strong class="mt-1 block text-xl ${index === 5 ? profitClass : 'text-slate-900'}">${value}</strong><p class="mt-1 text-xs text-slate-500">${note}</p></div>`).join('');
    el('history').innerHTML = (recordPayload.records || []).slice().reverse().map(record => {
      const numbers = (record.topNumbers || []).slice().sort((left, right) => Number(left.number) - Number(right.number));
      const abstained = Boolean(record.abstained) || numbers.length !== 30;
      const result = record.settled ? fmt(record.actual) : '--';
      const resultStatus = abstained ? 'Không phát dàn' : record.settled ? (record.hit ? 'Trúng' : 'Trượt') : 'Chờ';
      const resultClass = abstained ? 'bg-slate-100 text-slate-700 border-slate-200' : record.hit ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : record.settled ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-800 border-amber-200';
      const numberChips = numbers.map(item => {
        const isActual = record.settled && Number(item.number) === Number(record.actual);
        return `<span class="rounded-lg border px-2.5 py-1.5 font-bold ${isActual ? 'border-amber-400 bg-amber-300 text-amber-950 ring-2 ring-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}">${fmt(item.number)}${isActual ? '<small class="ml-1 text-[10px]">KQ</small>' : ''}</span>`;
      }).join('');
      const version = isV2(record) ? 'v2' : 'v1 legacy';
      return `<article class="p-5"><div class="flex flex-wrap items-start justify-between gap-3"><div><strong class="text-lg">${record.predictionDate}</strong><p class="mt-1 text-sm text-slate-500">Dữ liệu đến ${record.sourceDataThrough || '-'} · ${numbers.length} số đã chốt · ${version}</p></div><div class="text-right"><span class="inline-block rounded-full border px-3 py-1 text-sm font-bold ${resultClass}">${resultStatus}</span><p class="mt-2 text-sm font-bold ${abstained ? 'text-slate-500' : record.settled && record.hit ? 'text-emerald-700' : record.settled ? 'text-rose-700' : 'text-slate-500'}">Kết quả: ${result}</p></div></div>${abstained ? '<p class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Không có trục phân bổ đủ bằng chứng prequential cho trạng thái này, nên không phát dàn và không cộng vào thắng/thua.</p>' : `<div class="mt-4 flex flex-wrap gap-2">${numberChips}</div>${record.settled && !record.hit ? `<p class="mt-3 text-sm text-rose-700">Số ${result} không nằm trong dàn snapshot này.</p>` : ''}`}</article>`;
    }).join('') || '<p class="p-5 text-slate-500">Chưa có nhật ký.</p>';
  }

  el('distribution-axis-select')?.addEventListener('change', event => {
    activeDistributionAxisId = event.target.value;
    renderDistributionExplorer(activeDistributionRecord);
  });

  fetch('/api/probability-score', { cache: 'no-store' })
    .then(response => response.json())
    .then(payload => { if (!payload.success) throw new Error(payload.error); render(payload); })
    .catch(error => { el('status').innerHTML = `<strong class="text-rose-700">Không tải được Điểm xác suất.</strong> ${error.message}`; });
})();
