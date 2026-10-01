@extends('admin.layouts.app')

@section('content')
<div class="container">
    <h1>Create New Session</h1>
    <form action="{{ route('admin.league_sessions.store') }}" method="POST">
        @csrf
        <div class="mb-3">
            <label for="name" class="form-label">Session Name</label>
            <input type="text" name="name" id="name" class="form-control" required>
        </div>

        <div class="form-group mb-3">
            <label for="market_type">Market Type</label>
            <select class="form-control" id="market_type" name="market_type" required onchange="loadCategories()">
                <option value="">Select Market Type</option>
                <option value="stock">Stock</option>
                <option value="crypto">Crypto</option>
            </select>
        </div>

        <!-- Category Tabs Section -->
        <div id="category-tabs-section" style="display:none;">
            <ul class="nav nav-tabs" id="categoryTabs" role="tablist"></ul>
            <div class="tab-content" id="categoryTabContent"></div>
        </div>

        <div class="mb-3">
            <label for="max_stocks" class="form-label">Max Stocks in Portfolio</label>
            <input type="number" name="max_stocks" id="max_stocks" class="form-control" required>
        </div>

        <div class="mb-3">
            <label for="start_time" class="form-label">Start Date & Time</label>
            <input type="datetime-local" name="start_time" id="start_time" class="form-control" required>
        </div>

        <div class="mb-3">
            <label for="end_time" class="form-label">End Date & Time</label>
            <input type="datetime-local" name="end_time" id="end_time" class="form-control" required>
        </div>

        <div class="mb-3">
            <label for="status" class="form-label">Status</label>
            <select name="status" id="status" class="form-control">
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
            </select>
        </div>

        <div class="mb-3">
            <label for="active" class="form-label">Active</label>
            <select name="active" id="active" class="form-control">
                <option value="1">Active</option>
                <option value="0">Inactive</option>
            </select>
        </div>

        <button type="submit" class="btn btn-success">Create Session</button>
    </form>
</div>

<script>
    function loadCategories() {
        var marketType = document.getElementById('market_type').value;
        var tabsSection = document.getElementById('category-tabs-section');
        
        if (!marketType) {
            tabsSection.style.display = 'none';
            return;
        }
        
        fetch(`/admin/api/categories/${marketType}`)
            .then(response => response.json())
            .then(data => {
                createCategoryTabs(data, marketType);
                tabsSection.style.display = 'block';
            });
    }
    
    function createCategoryTabs(categories, marketType) {
        var tabsHtml = '';
        var contentHtml = '';
        
        categories.forEach((category, index) => {
            var isActive = index === 0 ? 'active' : '';
            var isShow = index === 0 ? 'show active' : '';
            
            tabsHtml += `<li class="nav-item" role="presentation">
                <button class="nav-link ${isActive}" id="tab-${category.id}" data-bs-toggle="tab" data-bs-target="#content-${category.id}" type="button" role="tab">${category.name}</button>
            </li>`;
            
            contentHtml += `<div class="tab-pane fade ${isShow}" id="content-${category.id}" role="tabpanel">
                <div class="p-3">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="mb-0">Select ${category.name}</h6>
                        <button type="button" class="btn btn-sm btn-outline-primary" onclick="refreshPrices('${category.id}', '${marketType}')">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                    <div class="table-responsive" style="max-height:400px;overflow-y:auto;">
                        <table class="table table-sm table-hover">
                            <thead class="table-dark sticky-top">
                                <tr>
                                    <th width="50">Select</th>
                                    <th>Symbol</th>
                                    <th>Price</th>
                                    <th>Change</th>
                                    <th>Change %</th>
                                </tr>
                            </thead>
                            <tbody id="assets-${category.id}"></tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        });
        
        document.getElementById('categoryTabs').innerHTML = tabsHtml;
        document.getElementById('categoryTabContent').innerHTML = contentHtml;
        
        categories.forEach(category => {
            setTimeout(() => loadAssetsForCategory(category.id, marketType), 100);
        });
    }
    
    function loadAssetsForCategory(categoryId, marketType) {
        var container = document.getElementById(`assets-${categoryId}`);
        if (!container) return;
        
        var assets = marketType === 'stock' ? getStocks() : getCryptos();
        var fieldName = marketType === 'stock' ? 'stocks' : 'cryptos';
        
        var html = '';
        assets.forEach(asset => {
            var value = marketType === 'stock' ? asset : asset.symbol;
            var name = marketType === 'stock' ? asset : asset.name;
            var rowId = `row_${marketType}_${categoryId}_${value.replace('-', '_')}`;
            
            html += `<tr id="${rowId}">
                <td>
                    <input class='form-check-input' type='checkbox' name='${fieldName}[${categoryId}][]' value='${value}' id='${marketType}_${categoryId}_${value}'>
                </td>
                <td>
                    <strong>${value}</strong>
                    ${marketType === 'crypto' ? `<br><small class="text-muted">${name}</small>` : ''}
                </td>
                <td id="price_${rowId}" class="fw-bold">Loading...</td>
                <td id="change_${rowId}">-</td>
                <td id="changepct_${rowId}">-</td>
            </tr>`;
        });
        
        container.innerHTML = html;
        loadPricesForAssets(assets, marketType, categoryId);
    }

    function getStocks() {
        return [
            "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "KOTAKBANK", "SBIN", "AXISBANK", "INDUSINDBK", "YESBANK",
            "ITC", "HINDUNILVR", "NESTLEIND", "MARICO", "BRITANNIA", "DABUR", "GODREJCP", "COLPAL",
            "HCLTECH", "TECHM", "WIPRO", "LTIM", "MPHASIS", "PERSISTENT", "LTI",
            "SUNPHARMA", "CIPLA", "DRREDDY", "DIVISLAB", "AUROPHARMA", "BIOCON", "LUPIN", "CADILAHC", "APOLLOHOSP",
            "ICICIPRULI", "HDFCLIFE", "SBILIFE", "ICICIGI", "MAXHEALTH",
            "TATAMOTORS", "M&M", "MARUTI", "BAJAJ-AUTO", "HERO", "EICHERMOT", "ASHOKLEY", "ESCORTS", "TVSMOTOR",
            "BHARTIARTL", "IDEA", "VODAFONE", "JIOFIN",
            "ADANIGREEN", "ADANIPORTS", "ADANIENT", "ADANIPOWER", "ADANITRANS",
            "NTPC", "POWERGRID", "TATASTEEL", "JSWSTEEL", "HINDALCO", "COALINDIA", "NMDC", "NATIONALALUM", "SAIL",
            "IOC", "BPCL", "HPCL", "ONGC", "GAIL", "PETRONET",
            "ULTRACEMCO", "SHREECEM", "ACC", "AMBUJACEM", "GRASIM",
            "DLF", "GODREJPROP", "OBEROIRLTY", "PRESTIGE", "PHOENIXLTD",
            "HAVELLS", "CROMPTON", "VGUARD", "FINCABLES",
            "TATAPOWER", "JSWENERGY", "NHPC", "PFC", "REC",
            "IRCTC", "CONCOR", "GMRINFRA", "L&T", "BEL", "BHEL", "HAL", "COFORGE", "POLYCAB"
        ];
    }
    
    function getCryptos() {
        return [
            {symbol: "BTC-USD", name: "Bitcoin"},
            {symbol: "ETH-USD", name: "Ethereum"},
            {symbol: "USDT-USD", name: "Tether"},
            {symbol: "BNB-USD", name: "BNB"},
            {symbol: "SOL-USD", name: "Solana"},
            {symbol: "XRP-USD", name: "XRP"},
            {symbol: "USDC-USD", name: "USD Coin"},
            {symbol: "ADA-USD", name: "Cardano"},
            {symbol: "DOGE-USD", name: "Dogecoin"},
            {symbol: "AVAX-USD", name: "Avalanche"},
            {symbol: "TRX-USD", name: "TRON"},
            {symbol: "DOT-USD", name: "Polkadot"},
            {symbol: "SHIB-USD", name: "Shiba Inu"},
            {symbol: "MATIC-USD", name: "Polygon"},
            {symbol: "TON-USD", name: "Toncoin"},
            {symbol: "BCH-USD", name: "Bitcoin Cash"},
            {symbol: "LTC-USD", name: "Litecoin"},
            {symbol: "LINK-USD", name: "Chainlink"},
            {symbol: "XLM-USD", name: "Stellar"},
            {symbol: "NEAR-USD", name: "NEAR Protocol"},
            {symbol: "UNI-USD", name: "Uniswap"},
            {symbol: "LEO-USD", name: "UNUS SED LEO"},
            {symbol: "DAI-USD", name: "Dai"},
            {symbol: "ETC-USD", name: "Ethereum Classic"},
            {symbol: "APT-USD", name: "Aptos"},
            {symbol: "FIL-USD", name: "Filecoin"},
            {symbol: "IMX-USD", name: "Immutable X"},
            {symbol: "CRO-USD", name: "Cronos"},
            {symbol: "OKB-USD", name: "OKB"},
            {symbol: "ATOM-USD", name: "Cosmos"},
            {symbol: "HBAR-USD", name: "Hedera"},
            {symbol: "OP-USD", name: "Optimism"},
            {symbol: "ARB-USD", name: "Arbitrum"},
            {symbol: "VET-USD", name: "VeChain"},
            {symbol: "QNT-USD", name: "Quant"},
            {symbol: "AAVE-USD", name: "Aave"},
            {symbol: "MKR-USD", name: "Maker"},
            {symbol: "RUNE-USD", name: "THORChain"},
            {symbol: "ALGO-USD", name: "Algorand"},
            {symbol: "ICP-USD", name: "Internet Computer"},
            {symbol: "SAND-USD", name: "The Sandbox"},
            {symbol: "MANA-USD", name: "Decentraland"},
            {symbol: "EGLD-USD", name: "MultiversX"},
            {symbol: "FLOW-USD", name: "Flow"},
            {symbol: "GRT-USD", name: "The Graph"},
            {symbol: "XMR-USD", name: "Monero"},
            {symbol: "KAVA-USD", name: "Kava"},
            {symbol: "CHZ-USD", name: "Chiliz"},
            {symbol: "STX-USD", name: "Stacks"},
            {symbol: "LUNC-USD", name: "Terra Classic"}
        ];
    }

    function loadPricesForAssets(assets, marketType, categoryId) {
        var endpoint = marketType === 'stock' ? '/admin/ajax/stock-data' : '/admin/ajax/crypto-data';
        var currency = marketType === 'stock' ? '₹' : '$';
        
        fetch(endpoint)
            .then(response => response.json())
            .then(data => {
                assets.forEach(asset => {
                    var symbol = marketType === 'stock' ? asset : asset.symbol;
                    var rowId = `row_${marketType}_${categoryId}_${symbol.replace('-', '_')}`;
                    
                    if (data[symbol]) {
                        var price = parseFloat(data[symbol].price || 0);
                        var change = parseFloat(data[symbol].change || 0);
                        var changePct = parseFloat(data[symbol].changePct || 0);
                        
                        var priceColor = change >= 0 ? 'text-success' : 'text-danger';
                        var changeColor = change >= 0 ? 'text-success' : 'text-danger';
                        var changeIcon = change >= 0 ? '↑' : '↓';
                        
                        var priceEl = document.getElementById(`price_${rowId}`);
                        var changeEl = document.getElementById(`change_${rowId}`);
                        var changePctEl = document.getElementById(`changepct_${rowId}`);
                        
                        if (priceEl) priceEl.innerHTML = `<span class="${priceColor}">${currency}${price.toFixed(2)}</span>`;
                        if (changeEl) changeEl.innerHTML = `<span class="${changeColor}">${changeIcon} ${Math.abs(change).toFixed(2)}</span>`;
                        if (changePctEl) changePctEl.innerHTML = `<span class="${changeColor}">${changePct.toFixed(2)}%</span>`;
                    } else {
                        var priceEl = document.getElementById(`price_${rowId}`);
                        var changeEl = document.getElementById(`change_${rowId}`);
                        var changePctEl = document.getElementById(`changepct_${rowId}`);
                        
                        if (priceEl) priceEl.innerHTML = '<span class="text-muted">N/A</span>';
                        if (changeEl) changeEl.innerHTML = '<span class="text-muted">-</span>';
                        if (changePctEl) changePctEl.innerHTML = '<span class="text-muted">-</span>';
                    }
                });
            })
            .catch(() => {
                assets.forEach(asset => {
                    var symbol = marketType === 'stock' ? asset : asset.symbol;
                    var rowId = `row_${marketType}_${categoryId}_${symbol.replace('-', '_')}`;
                    
                    var priceEl = document.getElementById(`price_${rowId}`);
                    var changeEl = document.getElementById(`change_${rowId}`);
                    var changePctEl = document.getElementById(`changepct_${rowId}`);
                    
                    if (priceEl) priceEl.innerHTML = '<span class="text-muted">Error</span>';
                    if (changeEl) changeEl.innerHTML = '<span class="text-muted">-</span>';
                    if (changePctEl) changePctEl.innerHTML = '<span class="text-muted">-</span>';
                });
            });
    }
    
    function refreshPrices(categoryId, marketType) {
        var assets = marketType === 'stock' ? getStocks() : getCryptos();
        loadPricesForAssets(assets, marketType, categoryId);
    }

    // Auto refresh prices every 5 seconds
    setInterval(function() {
        var marketTypeEl = document.getElementById('market_type');
        if (marketTypeEl && marketTypeEl.value) {
            var activeTab = document.querySelector('.tab-pane.active');
            if (activeTab) {
                var categoryId = activeTab.id.replace('content-', '');
                var assets = marketTypeEl.value === 'stock' ? getStocks() : getCryptos();
                loadPricesForAssets(assets, marketTypeEl.value, categoryId);
            }
        }
    }, 5000);
</script>
@endsection