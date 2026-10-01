<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Basket CRUD - ProbTrade</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; min-height: 100vh; }
        .header { background: #0055FF; color: white; padding: 16px; display: flex; align-items: center; gap: 12px; }
        .header h1 { font-size: 18px; font-weight: 600; flex: 1; text-align: center; }
        .back-btn { background: none; border: none; color: white; font-size: 24px; cursor: pointer; }
        .portfolio-boxes { background: white; padding: 16px; border-bottom: 1px solid #e0e0e0; }
        .boxes-container { display: flex; gap: 8px; overflow-x: auto; padding: 8px 0; }
        .portfolio-box { min-width: 80px; height: 48px; border: 1.5px solid #ccc; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; background: white; }
        .portfolio-box.filled { background: #e3f2fd; border-color: #0055FF; }
        .tabs { display: flex; background: white; border-bottom: 2px solid #e0e0e0; }
        .tab { flex: 1; padding: 12px; text-align: center; cursor: pointer; border-bottom: 3px solid transparent; font-weight: 500; color: #666; }
        .tab.active { color: #0055FF; border-bottom-color: #0055FF; }
        .asset-list { padding: 12px 16px; background: #f5f5f5; min-height: 400px; }
        .asset-item { background: white; border: 1.5px solid #e0e0e0; border-radius: 12px; padding: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; }
        .asset-item.selected { border-color: #0055FF; background: #f0f7ff; }
        .asset-info { flex: 1; }
        .asset-name { font-weight: bold; font-size: 16px; margin-bottom: 4px; }
        .asset-sector { font-size: 12px; color: #666; display: flex; align-items: center; gap: 8px; }
        .prediction-badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; color: white; }
        .prediction-badge.up { background: #4caf50; }
        .prediction-badge.down { background: #f44336; }
        .asset-actions { display: flex; gap: 6px; }
        .action-btn { width: 50px; height: 28px; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; }
        .action-btn.up { background: #81c784; }
        .action-btn.up.active { background: #388e3c; }
        .action-btn.down { background: #e57373; }
        .action-btn.down.active { background: #d32f2f; }
        .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: white; padding: 10px 12px; border-top: 1px solid #e0e0e0; display: flex; justify-content: flex-end; }
        .next-btn { background: #0055FF; color: white; border: none; padding: 12px 40px; border-radius: 16px; font-weight: bold; font-size: 15px; cursor: pointer; }
        .next-btn:disabled { background: #ccc; cursor: not-allowed; }
        .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); z-index: 1000; }
        .modal.show { display: flex; align-items: center; justify-content: center; }
        .modal-content { background: white; border-radius: 16px; padding: 24px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
        .modal-header { font-size: 20px; font-weight: bold; margin-bottom: 16px; text-align: center; }
        .multiplier-item { background: #f5f5f5; border-radius: 12px; padding: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; }
        .multiplier-options { display: flex; gap: 8px; margin-left: auto; }
        .multiplier-btn { width: 40px; height: 40px; border: 2px solid #ccc; border-radius: 8px; background: white; cursor: pointer; font-weight: bold; font-size: 18px; }
        .multiplier-btn.active { background: #ff9800; border-color: #ff9800; color: white; }
        .multiplier-btn.alpha.active { background: #ff9800; border-color: #ff9800; }
        .multiplier-btn.beta.active { background: #2196f3; border-color: #2196f3; }
        .multiplier-btn.one.active { background: #4caf50; border-color: #4caf50; }
        .multiplier-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .save-btn { width: 100%; background: #0055FF; color: white; border: none; padding: 14px; border-radius: 12px; font-weight: bold; font-size: 16px; cursor: pointer; margin-top: 16px; }
        .loading { text-align: center; padding: 40px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <button class="back-btn" onclick="goBack()">←</button>
            <h1>Create Basket</h1>
            <span style="width: 24px;"></span>
        </div>

        <div class="portfolio-boxes">
            <div class="boxes-container" id="portfolioBoxes"></div>
        </div>
        <div class="tabs" id="tabs"></div>
        <div class="asset-list" id="assetList">
            <div class="loading">Loading assets...</div>
        </div>
        <div class="bottom-bar">
            <button class="next-btn" id="nextBtn" onclick="showMultiplierModal()" disabled>NEXT</button>
        </div>
    </div>
    <div class="modal" id="multiplierModal">
        <div class="modal-content">
            <div class="modal-header">Select Multipliers</div>
            <div id="multiplierList"></div>
            <button class="save-btn" onclick="saveBasket()">SAVE BASKET</button>
        </div>
    </div>
    <script>
        const API_BASE = 'http://127.0.0.1:8000/v1';
        const CONTEST_ID = {{ $contestId }};
        const SESSION_ID = {{ $sessionId }};
        let allAssets = [], categories = [], selectedAssets = [], maxAssets = {{ $maxStocks }}, currentTab = 0, multipliers = {}, selectedUserId = {{ $defaultUserId }};

        async function init() {
            await fetchAssets();
            renderTabs();
            renderAssets();
            updatePortfolioBoxes();
        }



        async function fetchAssets() {
            try {
                const response = await fetch(`${API_BASE}/session-assets-grouped/${SESSION_ID}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (data.assets?.length) {
                    const categoryMap = {};
                    data.assets.forEach(asset => {
                        const categoryName = asset.category_name;
                        if (!categoryMap[categoryName]) categoryMap[categoryName] = { name: categoryName, id: asset.category_id, assets: [] };
                        categoryMap[categoryName].assets.push({ name: asset.symbol, fullName: asset.name, sector: categoryName, category_id: asset.category_id });
                    });
                    categories = Object.values(categoryMap);
                    categories.sort((a, b) => {
                        const aName = a.name.toLowerCase();
                        const bName = b.name.toLowerCase();
                        if (aName.includes('large')) return -1;
                        if (bName.includes('large')) return 1;
                        if (aName.includes('mid')) return -1;
                        if (bName.includes('mid')) return 1;
                        return 0;
                    });
                    allAssets = categories.flatMap(c => c.assets);
                } else {
                    document.getElementById('assetList').innerHTML = '<div class="loading" style="color: red;">No assets found for this session</div>';
                }
            } catch (error) {
                console.error('Fetch error:', error);
                document.getElementById('assetList').innerHTML = '<div class="loading" style="color: red;">Error loading assets</div>';
            }
        }

        function renderTabs() {
            document.getElementById('tabs').innerHTML = categories.map((cat, i) => `<div class="tab ${i === currentTab ? 'active' : ''}" onclick="switchTab(${i})">${cat.name}</div>`).join('');
        }

        function switchTab(index) {
            currentTab = index;
            renderTabs();
            renderAssets();
        }

        function renderAssets() {
            const categoryAssets = categories[currentTab]?.assets || [];
            document.getElementById('assetList').innerHTML = categoryAssets.map(asset => {
                const selected = selectedAssets.find(s => s.name === asset.name);
                const prediction = selected?.prediction || '';
                return `<div class="asset-item ${selected ? 'selected' : ''}">
                    <div class="asset-info">
                        <div class="asset-name">${asset.name}</div>
                        <div class="asset-sector">${asset.sector} ${prediction ? `<span class="prediction-badge ${prediction.toLowerCase()}">${prediction}</span>` : ''}</div>
                    </div>
                    <div class="asset-actions">
                        <button class="action-btn up ${prediction === 'UP' ? 'active' : ''}" onclick="selectAsset('${asset.name}', 'UP')">↑</button>
                        <button class="action-btn down ${prediction === 'DOWN' ? 'active' : ''}" onclick="selectAsset('${asset.name}', 'DOWN')">↓</button>
                    </div>
                </div>`;
            }).join('');
        }

        function selectAsset(name, prediction) {
            const asset = allAssets.find(a => a.name === name);
            const existingIndex = selectedAssets.findIndex(s => s.name === name);
            if (existingIndex >= 0) {
                if (selectedAssets[existingIndex].prediction === prediction) selectedAssets.splice(existingIndex, 1);
                else selectedAssets[existingIndex].prediction = prediction;
            } else {
                if (selectedAssets.length >= maxAssets) { alert(`Maximum ${maxAssets} assets allowed`); return; }
                selectedAssets.push({ ...asset, prediction });
            }
            renderAssets();
            updatePortfolioBoxes();
            updateNextButton();
        }

        function updatePortfolioBoxes() {
            document.getElementById('portfolioBoxes').innerHTML = Array.from({ length: maxAssets }, (_, i) => {
                const asset = selectedAssets[i];
                return `<div class="portfolio-box ${asset ? 'filled' : ''}">${asset ? asset.name : i + 1}</div>`;
            }).join('');
        }

        function updateNextButton() {
            const btn = document.getElementById('nextBtn');
            const hasAllCategories = categories.every(cat => selectedAssets.some(s => s.sector === cat.name));
            btn.disabled = selectedAssets.length !== maxAssets || !hasAllCategories;
        }

        function showMultiplierModal() {
            selectedAssets.forEach(asset => { if (!multipliers[asset.name]) multipliers[asset.name] = 1; });
            const alphaCount = Object.values(multipliers).filter(m => m === 2).length;
            const betaCount = Object.values(multipliers).filter(m => m === 1.5).length;
            
            document.getElementById('multiplierList').innerHTML = selectedAssets.map(asset => {
                const currentMultiplier = multipliers[asset.name];
                const alphaDisabled = currentMultiplier !== 2 && alphaCount >= 1;
                const betaDisabled = currentMultiplier !== 1.5 && betaCount >= 1;
                
                return `<div class="multiplier-item">
                    <div><div style="font-weight: bold;">${asset.name}</div><div style="font-size: 12px; color: #666;">${asset.sector}</div></div>
                    <div class="multiplier-options">
                        <button class="multiplier-btn alpha ${currentMultiplier === 2 ? 'active' : ''}" onclick="setMultiplier('${asset.name}', 2)" ${alphaDisabled ? 'disabled' : ''}>α</button>
                        <button class="multiplier-btn beta ${currentMultiplier === 1.5 ? 'active' : ''}" onclick="setMultiplier('${asset.name}', 1.5)" ${betaDisabled ? 'disabled' : ''}>β</button>
                        <button class="multiplier-btn one ${currentMultiplier === 1 ? 'active' : ''}" onclick="setMultiplier('${asset.name}', 1)">1x</button>
                    </div>
                </div>`;
            }).join('');
            document.getElementById('multiplierModal').classList.add('show');
        }

        function setMultiplier(name, value) {
            multipliers[name] = value;
            showMultiplierModal();
        }

        async function saveBasket() {
            const assets = selectedAssets.map(asset => ({ name: asset.name, sector: asset.sector, category_id: asset.category_id, prediction: asset.prediction, symbol: asset.name }));
            const multiplierArray = selectedAssets.map((asset, index) => ({ index, asset_name: asset.name, multiplier: multipliers[asset.name] || 1, prediction: asset.prediction, selected: true }));
            const payload = { user_id: selectedUserId, session_id: SESSION_ID, is_standalone: 1, assets, multipliers: multiplierArray };
            console.log('Payload:', payload);
            try {
                const response = await fetch(`${API_BASE}/save-basket`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                console.log('Response:', result);
                if (result.success) {
                    alert(`Basket saved! Serial: ${result.serial_no || result.basket_id}`);
                    window.location.href = '/admin/testing/contest/' + CONTEST_ID;
                } else {
                    alert('Failed: ' + result.message);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error saving basket');
            }
        }

        function goBack() {
            window.location.href = '/admin/testing/contest/' + CONTEST_ID;
        }

        init();
        String.prototype.hashCode = function() {
            let hash = 0;
            for (let i = 0; i < this.length; i++) {
                hash = ((hash << 5) - hash) + this.charCodeAt(i);
                hash = hash & hash;
            }
            return Math.abs(hash);
        };
    </script>
</body>
</html>
