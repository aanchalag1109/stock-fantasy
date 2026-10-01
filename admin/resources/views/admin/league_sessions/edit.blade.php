
@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-pencil-square text-warning me-2"></i>Edit Session</h1>
            <p class="text-muted mb-0">Modify session parameters and settings</p>
        </div>
        <a href="{{ route('admin.league_sessions.index') }}" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Back to Sessions
        </a>
    </div>

    <!-- Status Alerts -->
    @if($leagueSession->status === 'live')
        <div class="alert alert-warning border-0 shadow-sm mb-4">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            <strong>Live Session:</strong> You can only deactivate it (will refund all users).
        </div>
    @elseif($leagueSession->status === 'upcoming')
        <div class="alert alert-info border-0 shadow-sm mb-4">
            <i class="bi bi-info-circle-fill me-2"></i>
            <strong>Upcoming Session:</strong> You can modify session times and settings.
        </div>
    @endif

    <div class="row">
        <div class="col-12">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-gradient-warning text-white">
                    <h5 class="mb-0"><i class="bi bi-gear-fill me-2"></i>Session Configuration</h5>
                </div>
                <div class="card-body p-4">
                    <form action="{{ route('admin.league_sessions.update', $leagueSession) }}" method="POST">
                        @csrf
                        @method('PUT')
                        
                        <!-- Basic Information Section -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-info-circle me-2"></i>Basic Information</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="name" class="form-label fw-semibold">Session Name <span class="text-danger">*</span></label>
                                    <input type="text" name="name" id="name" class="form-control form-control-lg" value="{{ $leagueSession->name }}" 
                                        {{ $leagueSession->status === 'upcoming' ? 'readonly' : 'required' }}>
                                    @if($leagueSession->status === 'upcoming')
                                        <div class="form-text text-muted"><i class="bi bi-lock me-1"></i>Locked for upcoming sessions</div>
                                    @endif
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="market_type" class="form-label fw-semibold">Market Type <span class="text-danger">*</span></label>
                                    <select class="form-select form-select-lg" id="market_type" name="market_type" 
                                        {{ $leagueSession->status === 'upcoming' ? 'disabled' : 'required' }} onchange="loadCategories()">
                                        <option value="">Choose market type</option>
                                        <option value="stock" {{ $leagueSession->market_type == 'stock' ? 'selected' : '' }}>
                                            <i class="bi bi-graph-up"></i> Stock Market
                                        </option>
                                        <option value="crypto" {{ $leagueSession->market_type == 'crypto' ? 'selected' : '' }}>
                                            <i class="bi bi-currency-bitcoin"></i> Cryptocurrency
                                        </option>
                                    </select>
                                    @if($leagueSession->status === 'upcoming')
                                        <input type="hidden" name="market_type" value="{{ $leagueSession->market_type }}">
                                        <div class="form-text text-muted"><i class="bi bi-lock me-1"></i>Locked for upcoming sessions</div>
                                    @endif
                                </div>
                            </div>
                        </div>

                        <!-- Assets Selection Section -->
                        <div id="category-tabs-section" class="mb-4" {{ $leagueSession->status === 'upcoming' ? 'style="pointer-events: none; opacity: 0.6;"' : '' }}>
                            <div class="row">
                                <div class="col-12">
                                    <h6 class="text-warning mb-3"><i class="bi bi-collection me-2"></i>Asset Selection</h6>
                                </div>
                            </div>
                            <div class="card border-0 bg-light">
                                <div class="card-body">
                                    <ul class="nav nav-pills nav-fill mb-3" id="categoryTabs" role="tablist"></ul>
                                    <div class="tab-content" id="categoryTabContent"></div>
                                    @if($leagueSession->status === 'upcoming')
                                        <div class="alert alert-warning border-0 mt-3">
                                            <i class="bi bi-lock-fill me-2"></i>Asset selection is locked for upcoming sessions.
                                        </div>
                                    @endif
                                </div>
                            </div>
                        </div>

                        <!-- Portfolio Settings -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-briefcase me-2"></i>Portfolio Settings</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="max_stocks" class="form-label fw-semibold">Max Assets in Portfolio <span class="text-danger">*</span></label>
                                    <input type="number" name="max_stocks" id="max_stocks" class="form-control form-control-lg" value="{{ $leagueSession->max_stocks }}" 
                                        {{ $leagueSession->status === 'upcoming' ? 'readonly' : 'required' }} min="1" max="50">
                                    @if($leagueSession->status === 'upcoming')
                                        <div class="form-text text-muted"><i class="bi bi-lock me-1"></i>Locked for upcoming sessions</div>
                                    @else
                                        <div class="form-text">Maximum number of assets a user can hold in their portfolio</div>
                                    @endif
                                </div>
                            </div>
                        </div>

                        <!-- Schedule Settings -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-calendar-event me-2"></i>Schedule Settings</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="start_time" class="form-label fw-semibold">Session Starts <span class="text-danger">*</span></label>
                                    <input type="datetime-local" name="start_time" id="start_time" class="form-control form-control-lg" 
                                        value="{{ date('Y-m-d\TH:i', strtotime($leagueSession->start_time)) }}" 
                                        {{ in_array($leagueSession->status, ['live']) ? 'readonly' : 'required' }}>
                                    @if(in_array($leagueSession->status, ['live']))
                                        <div class="form-text text-muted"><i class="bi bi-lock me-1"></i>Cannot modify live session times</div>
                                    @else
                                        <div class="form-text">Trading session start time</div>
                                    @endif
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="end_time" class="form-label fw-semibold">Session Ends <span class="text-danger">*</span></label>
                                    <input type="datetime-local" name="end_time" id="end_time" class="form-control form-control-lg" 
                                        value="{{ date('Y-m-d\TH:i', strtotime($leagueSession->end_time)) }}" 
                                        {{ in_array($leagueSession->status, ['live']) ? 'readonly' : 'required' }}>
                                    @if(in_array($leagueSession->status, ['live']))
                                        <div class="form-text text-muted"><i class="bi bi-lock me-1"></i>Cannot modify live session times</div>
                                    @endif
                                </div>
                            </div>
                        </div>

                        <!-- Status & Activation -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-toggles me-2"></i>Status & Activation</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="status" class="form-label fw-semibold">Session Status <span class="text-danger">*</span></label>
                                    <select name="status" id="status" class="form-select form-select-lg" {{ in_array($leagueSession->status, ['live', 'upcoming']) ? 'disabled' : '' }}>
                                        <option value="draft" @if($leagueSession->status == 'draft') selected @endif>📝 Draft</option>
                                        <option value="upcoming" @if($leagueSession->status == 'upcoming') selected @endif>⏰ Upcoming</option>
                                        <option value="live" @if($leagueSession->status == 'live') selected @endif>🔴 Live</option>
                                        <option value="completed" @if($leagueSession->status == 'completed') selected @endif>✅ Completed</option>
                                    </select>
                                    @if(in_array($leagueSession->status, ['live', 'upcoming']))
                                        <input type="hidden" name="status" value="{{ $leagueSession->status }}">
                                        <div class="form-text text-muted"><i class="bi bi-lock me-1"></i>Status locked for {{ $leagueSession->status }} sessions</div>
                                    @endif
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="active" class="form-label fw-semibold">Activation Status</label>
                                    <select name="active" id="active" class="form-select form-select-lg" 
                                        {{ $leagueSession->status === 'upcoming' ? 'disabled' : '' }}
                                        {{ $leagueSession->status === 'live' && $leagueSession->active ? 'onchange="confirmDeactivation()"' : '' }}>
                                        <option value="1" @if($leagueSession->active) selected @endif>🟢 Active</option>
                                        <option value="0" @if(!$leagueSession->active) selected @endif>🔴 Inactive</option>
                                    </select>
                                    @if($leagueSession->status === 'upcoming')
                                        <input type="hidden" name="active" value="{{ $leagueSession->active }}">
                                        <div class="form-text text-muted"><i class="bi bi-lock me-1"></i>Locked for upcoming sessions</div>
                                    @elseif($leagueSession->status === 'live')
                                        <div class="form-text text-warning"><i class="bi bi-exclamation-triangle me-1"></i>Deactivating will refund all users</div>
                                    @endif
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="row">
                            <div class="col-12">
                                <div class="d-flex gap-3 justify-content-end">
                                    <a href="{{ route('admin.league_sessions.index') }}" class="btn btn-outline-secondary btn-lg px-4">
                                        <i class="bi bi-x-circle me-2"></i>Cancel
                                    </a>
                                    <button type="submit" class="btn btn-warning btn-lg px-4">
                                        <i class="bi bi-check-circle me-2"></i>Update Session
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.bg-gradient-warning {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.card {
    border-radius: 15px;
    transition: all 0.3s ease;
}

.form-control, .form-select {
    border-radius: 10px;
    border: 2px solid #e9ecef;
    transition: all 0.3s ease;
}

.form-control:focus, .form-select:focus {
    border-color: #f093fb;
    box-shadow: 0 0 0 0.2rem rgba(240, 147, 251, 0.25);
}

.nav-pills .nav-link {
    border-radius: 25px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.nav-pills .nav-link.active {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.btn {
    border-radius: 10px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.btn-warning {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    border: none;
    color: white;
}

.btn-warning:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(240, 147, 251, 0.4);
    color: white;
}

.text-warning {
    color: #f093fb !important;
}

.alert {
    border-radius: 10px;
}

.table-responsive {
    border-radius: 10px;
    overflow: hidden;
}

.form-check-input:checked {
    background-color: #f093fb;
    border-color: #f093fb;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.card {
    animation: fadeIn 0.5s ease-out;
}
</style>

<script>
    var existingAssets = @json(\DB::table('league_session_assets')->where('league_session_id', $leagueSession->id)->get()->groupBy('category_id'));
    
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
            
            tabsHtml += `<li class="nav-item" role="presentation"><button class="nav-link ${isActive}" id="tab-${category.id}" data-bs-toggle="tab" data-bs-target="#content-${category.id}" type="button" role="tab">${category.name}</button></li>`;
            
            contentHtml += `<div class="tab-pane fade ${isShow}" id="content-${category.id}" role="tabpanel">
                <div class="p-4">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <div>
                            <h6 class="mb-1 text-warning">Select ${category.name}</h6>
                            <small class="text-muted">Choose assets for this category</small>
                        </div>
                        <div class="badge bg-warning fs-6" id="selected-count-${category.id}">0 selected</div>
                    </div>
                    <div class="table-responsive" style="max-height:500px;overflow-y:auto;border-radius:10px;">
                        <table class="table table-hover mb-0">
                            <thead class="sticky-top">
                                <tr>
                                    <th width="60" class="text-center">Select</th>
                                    <th>Asset Details</th>
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
            loadAssetsForCategory(category.id, marketType);
            updateSelectedCount(category.id, marketType);
        });
    }
    
    function loadAssetsForCategory(categoryId, marketType) {
        var container = document.getElementById(`assets-${categoryId}`);
        var assets = marketType === 'stock' ? getStocks() : getCryptos();
        var fieldName = marketType === 'stock' ? 'stocks' : 'cryptos';
        var selectedAssets = existingAssets[categoryId] ? existingAssets[categoryId].map(a => a.asset_symbol) : [];
        
        var html = '';
        assets.forEach(asset => {
            var value = marketType === 'stock' ? asset.symbol : asset.symbol;
            var name = marketType === 'stock' ? asset.name : asset.name;
            var checked = selectedAssets.includes(value) ? 'checked' : '';
            var rowId = `row_${marketType}_${categoryId}_${value.replace('-', '_')}`;
            
            html += `<tr id="${rowId}" class="asset-row">
                <td class="text-center">
                    <input class='form-check-input form-check-input-lg' type='checkbox' name='${fieldName}[${categoryId}][]' value='${value}' id='${marketType}_${categoryId}_${value}' ${checked} onchange='updateSelectedCount("${categoryId}", "${marketType}")'>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="me-3">
                            <img src="${getAssetImage(value, marketType)}" alt="${value}" class="rounded-circle shadow-sm" style="width: 40px; height: 40px; object-fit: cover;" onerror="this.src='https://ui-avatars.com/api/?name=${value.charAt(0)}&size=40&background=f093fb&color=fff';">
                        </div>
                        <div>
                            <div class="fw-bold text-dark">${value}</div>
                            <small class="text-muted">${name}</small>
                        </div>
                    </div>
                </td>
            </tr>`;
        });
        
        container.innerHTML = html;
    }
    
    function getStocks() {
        return [
            {symbol: "RELIANCE", name: "Reliance Industries"},
            {symbol: "TCS", name: "Tata Consultancy Services"},
            {symbol: "INFY", name: "Infosys"},
            {symbol: "HDFCBANK", name: "HDFC Bank"},
            {symbol: "ICICIBANK", name: "ICICI Bank"},
            {symbol: "KOTAKBANK", name: "Kotak Mahindra Bank"},
            {symbol: "SBIN", name: "State Bank of India"},
            {symbol: "AXISBANK", name: "Axis Bank"},
            {symbol: "INDUSINDBK", name: "IndusInd Bank"},
            {symbol: "YESBANK", name: "Yes Bank"},
            {symbol: "ITC", name: "ITC Limited"},
            {symbol: "HINDUNILVR", name: "Hindustan Unilever"},
            {symbol: "NESTLEIND", name: "Nestle India"},
            {symbol: "MARICO", name: "Marico Limited"},
            {symbol: "BRITANNIA", name: "Britannia Industries"},
            {symbol: "DABUR", name: "Dabur India"},
            {symbol: "GODREJCP", name: "Godrej Consumer Products"},
            {symbol: "COLPAL", name: "Colgate-Palmolive India"},
            {symbol: "HCLTECH", name: "HCL Technologies"},
            {symbol: "TECHM", name: "Tech Mahindra"},
            {symbol: "WIPRO", name: "Wipro Limited"},
            {symbol: "LTIM", name: "LTIMindtree"},
            {symbol: "MPHASIS", name: "Mphasis Limited"},
            {symbol: "PERSISTENT", name: "Persistent Systems"},
            {symbol: "LTI", name: "L&T Infotech"},
            {symbol: "SUNPHARMA", name: "Sun Pharmaceutical"},
            {symbol: "CIPLA", name: "Cipla Limited"},
            {symbol: "DRREDDY", name: "Dr. Reddy's Laboratories"},
            {symbol: "DIVISLAB", name: "Divi's Laboratories"},
            {symbol: "AUROPHARMA", name: "Aurobindo Pharma"},
            {symbol: "BIOCON", name: "Biocon Limited"},
            {symbol: "LUPIN", name: "Lupin Limited"},
            {symbol: "CADILAHC", name: "Cadila Healthcare"},
            {symbol: "APOLLOHOSP", name: "Apollo Hospitals"},
            {symbol: "ICICIPRULI", name: "ICICI Prudential Life"},
            {symbol: "HDFCLIFE", name: "HDFC Life Insurance"},
            {symbol: "SBILIFE", name: "SBI Life Insurance"},
            {symbol: "ICICIGI", name: "ICICI Lombard General"},
            {symbol: "MAXHEALTH", name: "Max Healthcare"},
            {symbol: "TATAMOTORS", name: "Tata Motors"},
            {symbol: "M&M", name: "Mahindra & Mahindra"},
            {symbol: "MARUTI", name: "Maruti Suzuki"},
            {symbol: "BAJAJ-AUTO", name: "Bajaj Auto"},
            {symbol: "HERO", name: "Hero MotoCorp"},
            {symbol: "EICHERMOT", name: "Eicher Motors"},
            {symbol: "ASHOKLEY", name: "Ashok Leyland"},
            {symbol: "ESCORTS", name: "Escorts Limited"},
            {symbol: "TVSMOTOR", name: "TVS Motor Company"},
            {symbol: "BHARTIARTL", name: "Bharti Airtel"},
            {symbol: "IDEA", name: "Vodafone Idea"},
            {symbol: "VODAFONE", name: "Vodafone Group"},
            {symbol: "JIOFIN", name: "Jio Financial Services"},
            {symbol: "ADANIGREEN", name: "Adani Green Energy"},
            {symbol: "ADANIPORTS", name: "Adani Ports"},
            {symbol: "ADANIENT", name: "Adani Enterprises"},
            {symbol: "ADANIPOWER", name: "Adani Power"},
            {symbol: "ADANITRANS", name: "Adani Transmission"},
            {symbol: "NTPC", name: "NTPC Limited"},
            {symbol: "POWERGRID", name: "Power Grid Corporation"},
            {symbol: "TATASTEEL", name: "Tata Steel"},
            {symbol: "JSWSTEEL", name: "JSW Steel"},
            {symbol: "HINDALCO", name: "Hindalco Industries"},
            {symbol: "COALINDIA", name: "Coal India"},
            {symbol: "NMDC", name: "NMDC Limited"},
            {symbol: "NATIONALALUM", name: "National Aluminium"},
            {symbol: "SAIL", name: "Steel Authority of India"},
            {symbol: "IOC", name: "Indian Oil Corporation"},
            {symbol: "BPCL", name: "Bharat Petroleum"},
            {symbol: "HPCL", name: "Hindustan Petroleum"},
            {symbol: "ONGC", name: "Oil & Natural Gas Corp"},
            {symbol: "GAIL", name: "GAIL India"},
            {symbol: "PETRONET", name: "Petronet LNG"},
            {symbol: "ULTRACEMCO", name: "UltraTech Cement"},
            {symbol: "SHREECEM", name: "Shree Cement"},
            {symbol: "ACC", name: "ACC Limited"},
            {symbol: "AMBUJACEM", name: "Ambuja Cements"},
            {symbol: "GRASIM", name: "Grasim Industries"},
            {symbol: "DLF", name: "DLF Limited"},
            {symbol: "GODREJPROP", name: "Godrej Properties"},
            {symbol: "OBEROIRLTY", name: "Oberoi Realty"},
            {symbol: "PRESTIGE", name: "Prestige Estates"},
            {symbol: "PHOENIXLTD", name: "Phoenix Mills"},
            {symbol: "HAVELLS", name: "Havells India"},
            {symbol: "CROMPTON", name: "Crompton Greaves"},
            {symbol: "VGUARD", name: "V-Guard Industries"},
            {symbol: "FINCABLES", name: "Finolex Cables"},
            {symbol: "TATAPOWER", name: "Tata Power"},
            {symbol: "JSWENERGY", name: "JSW Energy"},
            {symbol: "NHPC", name: "NHPC Limited"},
            {symbol: "PFC", name: "Power Finance Corporation"},
            {symbol: "REC", name: "REC Limited"},
            {symbol: "IRCTC", name: "Indian Railway Catering"},
            {symbol: "CONCOR", name: "Container Corporation"},
            {symbol: "GMRINFRA", name: "GMR Infrastructure"},
            {symbol: "L&T", name: "Larsen & Toubro"},
            {symbol: "BEL", name: "Bharat Electronics"},
            {symbol: "BHEL", name: "Bharat Heavy Electricals"},
            {symbol: "HAL", name: "Hindustan Aeronautics"},
            {symbol: "COFORGE", name: "Coforge Limited"},
            {symbol: "POLYCAB", name: "Polycab India"},
            {symbol: "AAPL", name: "Apple Inc."},
            {symbol: "MSFT", name: "Microsoft Corporation"},
            {symbol: "GOOGL", name: "Alphabet Inc."},
            {symbol: "AMZN", name: "Amazon.com Inc."},
            {symbol: "TSLA", name: "Tesla Inc."},
            {symbol: "META", name: "Meta Platforms Inc."},
            {symbol: "NVDA", name: "NVIDIA Corporation"},
            {symbol: "NFLX", name: "Netflix Inc."},
            {symbol: "JPM", name: "JPMorgan Chase & Co."},
            {symbol: "BAC", name: "Bank of America Corp."},
            {symbol: "WMT", name: "Walmart Inc."},
            {symbol: "JNJ", name: "Johnson & Johnson"},
            {symbol: "PG", name: "Procter & Gamble Co."},
            {symbol: "KO", name: "The Coca-Cola Company"},
            {symbol: "PEP", name: "PepsiCo Inc."},
            {symbol: "MCD", name: "McDonald's Corporation"},
            {symbol: "DIS", name: "The Walt Disney Company"},
            {symbol: "ADBE", name: "Adobe Inc."},
            {symbol: "CRM", name: "Salesforce Inc."},
            {symbol: "ORCL", name: "Oracle Corporation"},
            {symbol: "IBM", name: "International Business Machines"},
            {symbol: "INTC", name: "Intel Corporation"},
            {symbol: "AMD", name: "Advanced Micro Devices"},
            {symbol: "QCOM", name: "QUALCOMM Incorporated"},
            {symbol: "CSCO", name: "Cisco Systems Inc."},
            {symbol: "PYPL", name: "PayPal Holdings Inc."},
            {symbol: "UBER", name: "Uber Technologies Inc."},
            {symbol: "SPOT", name: "Spotify Technology S.A."},
            {symbol: "ZOOM", name: "Zoom Video Communications"},
            {symbol: "TWTR", name: "Twitter Inc."},
            {symbol: "SNAP", name: "Snap Inc."},
            {symbol: "SQ", name: "Block Inc."},
            {symbol: "ROKU", name: "Roku Inc."},
            {symbol: "SHOP", name: "Shopify Inc."},
            {symbol: "DOCU", name: "DocuSign Inc."},
            {symbol: "ZM", name: "Zoom Video Communications"},
            {symbol: "PLTR", name: "Palantir Technologies"},
            {symbol: "RBLX", name: "Roblox Corporation"},
            {symbol: "COIN", name: "Coinbase Global Inc."},
            {symbol: "HOOD", name: "Robinhood Markets Inc."},
            {symbol: "RIVN", name: "Rivian Automotive Inc."},
            {symbol: "LCID", name: "Lucid Group Inc."},
            {symbol: "NIO", name: "NIO Inc."},
            {symbol: "XPEV", name: "XPeng Inc."},
            {symbol: "LI", name: "Li Auto Inc."},
            {symbol: "BABA", name: "Alibaba Group Holding"},
            {symbol: "JD", name: "JD.com Inc."},
            {symbol: "PDD", name: "PDD Holdings Inc."},
            {symbol: "BIDU", name: "Baidu Inc."},
            {symbol: "NTES", name: "NetEase Inc."},
            {symbol: "TME", name: "Tencent Music Entertainment"},
            {symbol: "BILI", name: "Bilibili Inc."},
            {symbol: "DIDI", name: "DiDi Global Inc."},
            {symbol: "SHELL", name: "Shell plc"},
            {symbol: "BP", name: "BP p.l.c."},
            {symbol: "HSBC", name: "HSBC Holdings plc"},
            {symbol: "AZN", name: "AstraZeneca PLC"},
            {symbol: "GSK", name: "GSK plc"},
            {symbol: "ULVR", name: "Unilever PLC"},
            {symbol: "DGE", name: "Diageo plc"},
            {symbol: "VOD", name: "Vodafone Group Plc"},
            {symbol: "BT", name: "BT Group plc"},
            {symbol: "LLOY", name: "Lloyds Banking Group"},
            {symbol: "BARC", name: "Barclays PLC"},
            {symbol: "RBS", name: "NatWest Group plc"},
            {symbol: "STAN", name: "Standard Chartered PLC"},
            {symbol: "PRU", name: "Prudential plc"},
            {symbol: "AVIVA", name: "Aviva plc"},
            {symbol: "LGEN", name: "Legal & General Group"},
            {symbol: "RSA", name: "RSA Insurance Group"},
            {symbol: "TSCO", name: "Tesco PLC"},
            {symbol: "SBRY", name: "J Sainsbury plc"},
            {symbol: "MRW", name: "Morrison (Wm) Supermarkets"},
            {symbol: "OCDO", name: "Ocado Group plc"},
            {symbol: "NEXT", name: "Next plc"},
            {symbol: "MKS", name: "Marks & Spencer Group"},
            {symbol: "JD", name: "JD Sports Fashion plc"},
            {symbol: "FRAS", name: "Frasers Group plc"},
            {symbol: "ASOS", name: "ASOS Plc"},
            {symbol: "BOO", name: "boohoo group plc"},
            {symbol: "RTO", name: "Rentokil Initial plc"},
            {symbol: "EXPN", name: "Experian plc"},
            {symbol: "REL", name: "RELX PLC"},
            {symbol: "WPP", name: "WPP plc"},
            {symbol: "ITV", name: "ITV plc"},
            {symbol: "SKY", name: "Sky plc"},
            {symbol: "BT", name: "BT Group plc"},
            {symbol: "TALK", name: "TalkTalk Telecom Group"},
            {symbol: "RR", name: "Rolls-Royce Holdings plc"},
            {symbol: "BA", name: "BAE Systems plc"},
            {symbol: "MERL", name: "Meggitt PLC"},
            {symbol: "SMDS", name: "DS Smith Plc"},
            {symbol: "MNDI", name: "Mondi plc"},
            {symbol: "CCH", name: "Coca-Cola HBC AG"},
            {symbol: "UU", name: "United Utilities Group"},
            {symbol: "SVT", name: "Severn Trent Plc"},
            {symbol: "PNN", name: "Pennon Group Plc"},
            {symbol: "AWE", name: "AWE Limited"},
            {symbol: "NG", name: "National Grid plc"},
            {symbol: "SSE", name: "SSE plc"},
            {symbol: "CPG", name: "Compass Group PLC"},
            {symbol: "WTB", name: "Whitbread PLC"},
            {symbol: "IHG", name: "InterContinental Hotels"},
            {symbol: "TUI", name: "TUI AG"},
            {symbol: "EZJ", name: "easyJet plc"},
            {symbol: "IAG", name: "International Airlines Group"},
            {symbol: "RYA", name: "Ryanair Holdings plc"},
            {symbol: "WIZZ", name: "Wizz Air Holdings Plc"}
        ];
    }
    
    function getAssetImage(symbol, marketType) {
        if (marketType === 'stock') {
            return `https://logo.stockanalysis.com/${symbol.toLowerCase()}.svg`;
        } else {
            const cryptoSymbol = symbol.replace('-USD', '').toLowerCase();
            return `https://assets.coincap.io/assets/icons/${cryptoSymbol}@2x.png`;
        }
    }
    
    function updateSelectedCount(categoryId, marketType) {
        var fieldName = marketType === 'stock' ? 'stocks' : 'cryptos';
        var selectedCount = document.querySelectorAll(`input[name="${fieldName}[${categoryId}][]"]:checked`).length;
        var countBadge = document.getElementById(`selected-count-${categoryId}`);
        if (countBadge) {
            countBadge.textContent = `${selectedCount} selected`;
            countBadge.className = selectedCount > 0 ? 'badge bg-success fs-6' : 'badge bg-warning fs-6';
        }
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
            {symbol: "EGLD-USD", name: "MultiversX / Elrond"},
            {symbol: "FLOW-USD", name: "Flow"},
            {symbol: "GRT-USD", name: "The Graph"},
            {symbol: "XMR-USD", name: "Monero"},
            {symbol: "KAVA-USD", name: "Kava"},
            {symbol: "CHZ-USD", name: "Chiliz"},
            {symbol: "STX-USD", name: "Stacks"},
            {symbol: "LUNC-USD", name: "Terra Classic"},
            {symbol: "THETA-USD", name: "Theta Network"},
            {symbol: "FTM-USD", name: "Fantom"},
            {symbol: "CAKE-USD", name: "PancakeSwap"},
            {symbol: "MINA-USD", name: "Mina Protocol"},
            {symbol: "AXS-USD", name: "Axie Infinity"},
            {symbol: "ENJ-USD", name: "Enjin Coin"},
            {symbol: "1INCH-USD", name: "1inch Network"},
            {symbol: "COMP-USD", name: "Compound"},
            {symbol: "YFI-USD", name: "yearn.finance"},
            {symbol: "SNX-USD", name: "Synthetix"},
            {symbol: "CRV-USD", name: "Curve DAO Token"},
            {symbol: "BAL-USD", name: "Balancer"},
            {symbol: "SUSHI-USD", name: "SushiSwap"},
            {symbol: "ZRX-USD", name: "0x"},
            {symbol: "REN-USD", name: "Ren"},
            {symbol: "LRC-USD", name: "Loopring"},
            {symbol: "KNC-USD", name: "Kyber Network Crystal"},
            {symbol: "BAT-USD", name: "Basic Attention Token"},
            {symbol: "ZIL-USD", name: "Zilliqa"},
            {symbol: "QTUM-USD", name: "Qtum"},
            {symbol: "ICX-USD", name: "ICON"},
            {symbol: "ONT-USD", name: "Ontology"},
            {symbol: "ZEC-USD", name: "Zcash"},
            {symbol: "DASH-USD", name: "Dash"},
            {symbol: "DCR-USD", name: "Decred"},
            {symbol: "DGB-USD", name: "DigiByte"},
            {symbol: "RVN-USD", name: "Ravencoin"},
            {symbol: "NANO-USD", name: "Nano"},
            {symbol: "XTZ-USD", name: "Tezos"},
            {symbol: "WAVES-USD", name: "Waves"},
            {symbol: "LSK-USD", name: "Lisk"},
            {symbol: "ARK-USD", name: "Ark"},
            {symbol: "KMD-USD", name: "Komodo"},
            {symbol: "STRAT-USD", name: "Stratis"},
            {symbol: "NXT-USD", name: "Nxt"},
            {symbol: "BTS-USD", name: "BitShares"},
            {symbol: "STEEM-USD", name: "Steem"},
            {symbol: "GNT-USD", name: "Golem"},
            {symbol: "REP-USD", name: "Augur"},
            {symbol: "FCT-USD", name: "Factom"},
            {symbol: "MAID-USD", name: "MaidSafeCoin"},
            {symbol: "STORJ-USD", name: "Storj"},
            {symbol: "SIA-USD", name: "Siacoin"},
            {symbol: "BNT-USD", name: "Bancor"},
            {symbol: "ANT-USD", name: "Aragon"},
            {symbol: "MLN-USD", name: "Melon"},
            {symbol: "SALT-USD", name: "SALT"},
            {symbol: "PAY-USD", name: "TenX"},
            {symbol: "MTL-USD", name: "Metal"},
            {symbol: "FUN-USD", name: "FunFair"},
            {symbol: "DNT-USD", name: "district0x"},
            {symbol: "CVC-USD", name: "Civic"},
            {symbol: "ADX-USD", name: "AdEx"},
            {symbol: "POWR-USD", name: "Power Ledger"},
            {symbol: "REQ-USD", name: "Request Network"},
            {symbol: "SUB-USD", name: "Substratum"},
            {symbol: "MANA-USD", name: "Decentraland"},
            {symbol: "ENJ-USD", name: "Enjin Coin"}
        ];
    }

    function loadCheckboxes() {
        // Static stock list
        var stocks = [
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
        var selectedStocks = @json(json_decode($leagueSession->stocks ?? '[]'));
        var stockHtml = '';
        stocks.forEach(function(symbol) {
            var checked = selectedStocks.includes(symbol) ? 'checked' : '';
            stockHtml += `<div class='form-check'>
                <input class='form-check-input' type='checkbox' name='stocks[]' value='${symbol}' id='stock_${symbol}' ${checked}>
                <label class='form-check-label' for='stock_${symbol}'>${symbol}</label>
            </div>`;
        });
        document.getElementById('stock-checkboxes').innerHTML = stockHtml;
        document.getElementById('stock-loading').style.display = 'none';

        // Static crypto list
        var cryptos = [
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
            {symbol: "EGLD-USD", name: "MultiversX / Elrond"},
            {symbol: "FLOW-USD", name: "Flow"},
            {symbol: "GRT-USD", name: "The Graph"},
            {symbol: "XMR-USD", name: "Monero"},
            {symbol: "KAVA-USD", name: "Kava"},
            {symbol: "CHZ-USD", name: "Chiliz"},
            {symbol: "STX-USD", name: "Stacks"},
            {symbol: "LUNC-USD", name: "Terra Classic"}
        ];
        var selectedCryptos = @json(json_decode($leagueSession->cryptos ?? '[]'));
        var cryptoHtml = '';
        cryptos.forEach(function(item) {
            var checked = selectedCryptos.includes(item.symbol) ? 'checked' : '';
            cryptoHtml += `<div class='form-check'>
                <input class='form-check-input' type='checkbox' name='cryptos[]' value='${item.symbol}' id='crypto_${item.symbol}' ${checked}>
                <label class='form-check-label' for='crypto_${item.symbol}'>${item.symbol} (${item.name})</label>
            </div>`;
        });
        document.getElementById('crypto-checkboxes').innerHTML = cryptoHtml;
        document.getElementById('crypto-loading').style.display = 'none';
    }

    function confirmDeactivation() {
        if (document.getElementById('active').value === '0') {
            if (!confirm('Deactivating this live session will refund all users. Are you sure?')) {
                document.getElementById('active').value = '1';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        loadCheckboxes();
        // Load categories immediately if market type is already selected
        var marketType = document.getElementById('market_type').value;
        if (marketType) {
            loadCategories();
        }
    });
</script>
@endsection
