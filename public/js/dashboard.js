function formatCurrency(value) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatChartValue(value) {
    if (value === 0) return '0 €';
    const absVal = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    
    if (absVal >= 1000000) {
        return sign + (absVal / 1000000).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' M €';
    } else if (absVal >= 1000) {
        return sign + (absVal / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' k €';
    } else {
        return sign + absVal.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
    }
}

function parseDateVal(val) {
    if (!val) return null;
    const valStr = String(val).trim();
    if (/^\d{8}$/.test(valStr)) {
        return new Date(`${valStr.substring(0,4)}-${valStr.substring(4,6)}-${valStr.substring(6,8)}`);
    }
    if (typeof val === 'number') {
        return new Date(Math.round((val - 25569) * 86400 * 1000));
    }
    if (valStr.includes('/')) { 
        const parts = valStr.split('/');
        if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    return new Date(valStr);
}

function calculateDashboard(data) {
    if (!data || data.length < 2) return;
    
    const headers = data[0];
    const idxCompteNum = headers.indexOf('CompteNum');
    const idxDebit = headers.indexOf('Debit');
    const idxCredit = headers.indexOf('Credit');
    const idxEcritureDate = headers.indexOf('EcritureDate');
    const idxEcritureLet = headers.indexOf('EcritureLet');
    const idxJournalCode = headers.indexOf('JournalCode');
    const idxPieceDate = headers.indexOf('PieceDate');

    if (idxCompteNum === -1 || idxDebit === -1 || idxCredit === -1) return;

    let caNet = 0;
    let treso = 0;
    let encoursClient = 0;

    let achatStock = 0; // 60
    let chargesExt = 0; // 61, 62
    let impots = 0; // 63
    let personnel = 0; // 64
    
    const cashFlowMap = new Map(); // YYYY-MM -> { in: 0, out: 0 }
    const costsMap = new Map(); // level1 -> { total: 0, level2: Map(code -> total) }
    const agingBins = { '<30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
    const seasonMap = new Map(); // Year -> Map(Month -> CA)

    let maxDateInFile = new Date(0);

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        const dObj = parseDateVal(row[idxEcritureDate]);
        if (dObj && !isNaN(dObj) && dObj > maxDateInFile) {
            maxDateInFile = dObj;
        }
    }

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        
        const compte = String(row[idxCompteNum] || '').trim();
        const debit = parseFloat(row[idxDebit]) || 0;
        const credit = parseFloat(row[idxCredit]) || 0;
        const lettrage = row[idxEcritureLet];
        const dateObj = parseDateVal(row[idxEcritureDate]);
        const pieceDateObj = parseDateVal(row[idxPieceDate] || row[idxEcritureDate]);

        // KPIs
        if (compte.startsWith('70')) {
            const netCA = credit - debit;
            caNet += netCA;

            if (dateObj && !isNaN(dateObj)) {
                const year = dateObj.getFullYear();
                const month = dateObj.getMonth();
                if (!seasonMap.has(year)) {
                    seasonMap.set(year, new Array(12).fill(0));
                }
                seasonMap.get(year)[month] += netCA;
            }
        }
        
        if (compte.startsWith('51')) {
            treso += (debit - credit);
        }

        if (compte.startsWith('411')) {
            const amount = debit - credit;
            encoursClient += amount;
            
            if (!lettrage && pieceDateObj && !isNaN(pieceDateObj)) {
                const diffTime = Math.abs(maxDateInFile - pieceDateObj);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= 30) agingBins['<30'] += amount;
                else if (diffDays <= 60) agingBins['31-60'] += amount;
                else if (diffDays <= 90) agingBins['61-90'] += amount;
                else agingBins['>90'] += amount;
            }
        }

        // Waterfall
        if (compte.startsWith('60')) achatStock += (debit - credit);
        if (compte.startsWith('61') || compte.startsWith('62')) chargesExt += (debit - credit);
        if (compte.startsWith('63')) impots += (debit - credit);
        if (compte.startsWith('64')) personnel += (debit - credit);

        // Treemap
        if (compte.startsWith('6')) {
            let level1 = compte.substring(0, 2);
            if (level1 === '61' || level1 === '62') level1 = '61/62';
            
            let level2 = compte.substring(0, 3);
            if (level2.length < 3) level2 = compte;

            const amount = debit - credit;
            if (amount > 0) {
                if (!costsMap.has(level1)) costsMap.set(level1, { total: 0, level2: new Map() });
                const l1Obj = costsMap.get(level1);
                l1Obj.total += amount;
                l1Obj.level2.set(level2, (l1Obj.level2.get(level2) || 0) + amount);
            }
        }

        // Cash Flow (512) - Note: The user said "JournalCode lié aux comptes 512" and "Toutes les lignes au Debit sur le compte 512"
        if (compte.startsWith('512') && dateObj && !isNaN(dateObj)) {
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const key = `${yyyy}-${mm}`;
            if (!cashFlowMap.has(key)) cashFlowMap.set(key, { in: 0, out: 0 });
            cashFlowMap.get(key).in += debit;
            cashFlowMap.get(key).out += credit;
        }
    }

    document.getElementById('kpi-ca').textContent = formatCurrency(caNet);
    document.getElementById('kpi-treso').textContent = formatCurrency(treso);
    document.getElementById('kpi-client').textContent = formatCurrency(encoursClient);

    renderWaterfall(caNet, achatStock, chargesExt, impots, personnel);
    renderCashFlow(cashFlowMap);
    renderTreemap(costsMap);
    renderAging(agingBins);
    renderSeasonality(seasonMap);
}

function renderWaterfall(ca, achats, chargesExt, impots, pers) {
    const dom = document.getElementById('chart-waterfall');
    if (!dom) return;
    const chart = echarts.init(dom);
    const result = ca - achats - chargesExt - impots - pers;
    
    const variations = [ca, -achats, -chargesExt, -impots, -pers, result];
    const categories = ['CA', 'Achats', 'Ch. Ext', 'Impôts', 'Personnel', 'Résultat'];
    
    let current = 0;
    const data = [];
    
    variations.forEach((val, i) => {
        const isTotal = (i === 0 || i === variations.length - 1);
        let yStart, yEnd;
        
        if (isTotal) {
            yStart = 0;
            yEnd = val;
            current = val; // Only really needed for CA, but for result it's the end anyway
        } else {
            yStart = current;
            yEnd = current + val;
            current += val;
        }

        let color = '#0ea5e9'; // Bleu pour CA
        if (i === variations.length - 1) {
            color = '#334155'; // Gris foncé pour Résultat
        } else if (!isTotal) {
            color = val < 0 ? '#ef4444' : '#10b981'; // Rouge/Vert pour variations
        }

        data.push({
            value: [i, yStart, yEnd, val],
            itemStyle: { color: color }
        });
    });

    const option = {
        tooltip: { 
            trigger: 'item',
            formatter: function (params) {
                // params.value = [xIndex, yStart, yEnd, variation]
                const val = params.value[3];
                return params.name + '<br/>' + formatChartValue(val);
            }
        },
        grid: { left: '5%', right: '5%', bottom: '5%', containLabel: true },
        xAxis: { type: 'category', data: categories, axisLabel: { interval: 0, rotate: 30 } },
        yAxis: { type: 'value', axisLabel: { formatter: (v) => formatChartValue(v) } },
        series: [
            {
                type: 'custom',
                name: 'Montant',
                renderItem: function (params, api) {
                    const xValue = api.value(0);
                    const yStart = api.coord([xValue, api.value(1)]);
                    const yEnd = api.coord([xValue, api.value(2)]);
                    
                    // Largeur de la barre
                    const size = api.size([1, 0]);
                    const width = size[0] * 0.6;
                    
                    const x = yStart[0] - width / 2;
                    const y = Math.min(yStart[1], yEnd[1]);
                    const height = Math.abs(yEnd[1] - yStart[1]);

                    return {
                        type: 'rect',
                        shape: {
                            x: x,
                            y: y,
                            width: width,
                            height: height
                        },
                        style: api.style()
                    };
                },
                label: {
                    show: true,
                    position: 'top',
                    formatter: function (params) {
                        return formatChartValue(params.value[3]);
                    }
                },
                data: data
            }
        ]
    };
    chart.setOption(option, true);
}

function renderCashFlow(cashFlowMap) {
    const dom = document.getElementById('chart-cashflow');
    if (!dom) return;
    const chart = echarts.init(dom);
    
    const sortedKeys = Array.from(cashFlowMap.keys()).sort();
    const dataIn = sortedKeys.map(k => cashFlowMap.get(k).in);
    const dataOut = sortedKeys.map(k => -cashFlowMap.get(k).out);

    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value) => formatChartValue(value) },
        legend: { data: ['Encaissements', 'Décaissements'], top: 0 },
        grid: { left: '5%', right: '5%', bottom: '5%', containLabel: true },
        xAxis: { type: 'category', data: sortedKeys },
        yAxis: { type: 'value', axisLabel: { formatter: (v) => formatChartValue(v) } },
        series: [
            { name: 'Encaissements', type: 'bar', stack: 'Total', itemStyle: { color: '#10b981' }, data: dataIn },
            { name: 'Décaissements', type: 'bar', stack: 'Total', itemStyle: { color: '#ef4444' }, data: dataOut }
        ]
    };
    chart.setOption(option, true);
}

function renderTreemap(costsMap) {
    const dom = document.getElementById('chart-treemap');
    if (!dom) return;
    const chart = echarts.init(dom);
    
    const data = [];
    costsMap.forEach((l1Obj, l1Name) => {
        const children = [];
        l1Obj.level2.forEach((val, l2Name) => {
            children.push({ name: l2Name, value: val });
        });
        data.push({ name: l1Name, value: l1Obj.total, children: children });
    });

    const option = {
        tooltip: { formatter: function (params) { return params.name + ': ' + formatChartValue(params.value); } },
        series: [{
            type: 'treemap',
            data: data,
            roam: false,
            nodeClick: false,
            breadcrumb: { show: false },
            itemStyle: { borderColor: '#fff' },
            color: ['#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd']
        }]
    };
    chart.setOption(option, true);
}

function renderAging(bins) {
    const dom = document.getElementById('chart-aging');
    if (!dom) return;
    const chart = echarts.init(dom);
    
    const categories = ['<30 jours', '31-60 jours', '61-90 jours', '>90 jours'];
    const data = [bins['<30'], bins['31-60'], bins['61-90'], bins['>90']];

    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value) => formatChartValue(value) },
        grid: { left: '5%', right: '5%', bottom: '5%', containLabel: true },
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value', axisLabel: { formatter: (v) => formatChartValue(v) } },
        series: [{
            name: 'En-cours',
            type: 'bar',
            data: [
                { value: data[0], itemStyle: { color: '#10b981' } },
                { value: data[1], itemStyle: { color: '#f59e0b' } },
                { value: data[2], itemStyle: { color: '#f97316' } },
                { value: data[3], itemStyle: { color: '#ef4444' } }
            ]
        }]
    };
    chart.setOption(option, true);
}

function renderSeasonality(seasonMap) {
    const dom = document.getElementById('chart-season');
    if (!dom) return;
    const chart = echarts.init(dom);
    
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const series = [];
    const legendData = [];

    Array.from(seasonMap.keys()).sort().forEach(year => {
        legendData.push(String(year));
        series.push({
            name: String(year),
            type: 'line',
            smooth: true,
            data: seasonMap.get(year)
        });
    });

    const option = {
        tooltip: { trigger: 'axis', valueFormatter: (value) => formatChartValue(value) },
        legend: { data: legendData, top: 0 },
        grid: { left: '5%', right: '5%', bottom: '5%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: months },
        yAxis: { type: 'value', axisLabel: { formatter: (v) => formatChartValue(v) } },
        series: series
    };
    chart.setOption(option, true);
}

window.addEventListener('resize', () => {
    const charts = ['waterfall', 'cashflow', 'treemap', 'aging', 'season'];
    charts.forEach(id => {
        const dom = document.getElementById('chart-' + id);
        if (dom) {
            const instance = echarts.getInstanceByDom(dom);
            if (instance) instance.resize();
        }
    });
});
