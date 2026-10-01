@extends('admin.layouts.app')

@section('content')
<div class="min-vh-100" style="background: linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 50%, #a5d6a7 100%);">
    <div class="container-fluid py-4">
        <div class="row">
            <!-- Main Form -->
            <div class="col-lg-8">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 text-center py-4" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 20px 20px 0 0;">
                        <h2 class="mb-0 text-white" style="font-weight: 700; letter-spacing: 1px;">
                            <i class="bi bi-plus-circle-fill me-2"></i>Create New Portfolio
                        </h2>
                        <p class="mb-0 text-white opacity-75">Set up a new portfolio with selected assets</p>
                    </div>
                    
                    @if ($errors->any())
                        <div class="alert alert-danger mx-4 mt-4 border-0" style="border-radius: 12px;">
                            <h6 class="alert-heading"><i class="bi bi-exclamation-triangle-fill me-2"></i>Please fix the following errors:</h6>
                            <ul class="mb-0">
                                @foreach ($errors->all() as $error)
                                    <li>{{ $error }}</li>
                                @endforeach
                            </ul>
                        </div>
                    @endif

                    <div class="card-body p-4">
                        <form method="POST" action="{{ route('admin.saved-baskets.store') }}">
                            @csrf
                            
                            <!-- Basic Information -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <h5 class="text-success mb-3" style="font-weight: 600;">
                                        <i class="bi bi-info-circle-fill me-2"></i>Basic Information
                                    </h5>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="user_id" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-person me-1"></i>User
                                    </label>
                                    <select id="user_id" name="user_id" class="form-select form-select-lg" style="border-radius: 12px;" required>
                                        <option value="">Select User</option>
                                        @foreach($users as $user)
                                            <option value="{{ $user->id }}">{{ $user->name }} ({{ $user->mobile }})</option>
                                        @endforeach
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="contest_id" class="form-label fw-semibold text-dark">
                                        <i class="bi bi-trophy me-1"></i>Contest
                                    </label>
                                    <select id="contest_id" name="contest_id" class="form-select form-select-lg" style="border-radius: 12px;" required>
                                        <option value="">Select Contest</option>
                                        @foreach($contests as $contest)
                                            <option value="{{ $contest->id }}">Contest #{{ $contest->id }} - {{ $contest->category }}</option>
                                        @endforeach
                                    </select>
                                </div>
                            </div>

                            <!-- Asset Selection -->
                            <div class="mb-4">
                                <h5 class="text-success mb-3" style="font-weight: 600;">
                                    <i class="bi bi-collection-fill me-2"></i>Asset Selection
                                </h5>
                                <div class="card border-0" style="background: #f8f9fa; border-radius: 15px;">
                                    <div class="card-body p-4">
                                        <div class="row mb-3">
                                            <div class="col-md-6">
                                                <label class="form-label fw-semibold">Available Assets</label>
                                                <div class="border rounded p-3" style="height: 300px; overflow-y: auto; background: white;">
                                                    <div id="availableAssets">
                                                        <!-- Assets will be loaded here -->
                                                        <div class="text-center text-muted py-4">
                                                            <i class="bi bi-collection display-4 opacity-25"></i>
                                                            <p class="mt-2">Select a contest to load assets</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label fw-semibold">Selected Assets</label>
                                                <div class="border rounded p-3" style="height: 300px; overflow-y: auto; background: white;">
                                                    <div id="selectedAssets">
                                                        <div class="text-center text-muted py-4">
                                                            <i class="bi bi-wallet2 display-4 opacity-25"></i>
                                                            <p class="mt-2">No assets selected</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <input type="hidden" name="assets" id="assetsInput" value="[]">
                                    </div>
                                </div>
                            </div>

                            <!-- Multipliers -->
                            <div class="mb-4">
                                <h5 class="text-success mb-3" style="font-weight: 600;">
                                    <i class="bi bi-star-fill me-2"></i>Multipliers
                                </h5>
                                <div class="card border-0" style="background: #f8f9fa; border-radius: 15px;">
                                    <div class="card-body p-4">
                                        <div id="multipliersSection">
                                            <div class="text-center text-muted py-4">
                                                <i class="bi bi-star display-4 opacity-25"></i>
                                                <p class="mt-2">Select assets to configure multipliers</p>
                                            </div>
                                        </div>
                                        <input type="hidden" name="multipliers" id="multipliersInput" value="[]">
                                    </div>
                                </div>
                            </div>

                            <div class="text-center">
                                <button type="submit" class="btn btn-lg px-5 py-3" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border: none; border-radius: 15px; color: white; font-weight: 600; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(76,175,80,0.3);">
                                    <i class="bi bi-plus-circle-fill me-2"></i>Create Portfolio
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Guidelines Sidebar -->
            <div class="col-lg-4">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 text-center py-3" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-lightbulb-fill me-2"></i>Portfolio Guidelines
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <div class="mb-4">
                            <h6 class="text-success mb-2" style="font-weight: 600;">
                                <i class="bi bi-info-circle me-1"></i>Asset Selection
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Select diverse assets from different sectors</li>
                                <li class="mb-1">• Maximum 10 assets per portfolio</li>
                                <li class="mb-1">• Consider market trends and volatility</li>
                                <li class="mb-1">• Balance high-risk and stable assets</li>
                            </ul>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="text-success mb-2" style="font-weight: 600;">
                                <i class="bi bi-star me-1"></i>Multiplier Strategy
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• 2X multiplier: High confidence assets</li>
                                <li class="mb-1">• 1.5X multiplier: Moderate confidence</li>
                                <li class="mb-1">• 1X multiplier: Conservative picks</li>
                                <li class="mb-1">• Use multipliers strategically</li>
                            </ul>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="text-success mb-2" style="font-weight: 600;">
                                <i class="bi bi-shield-check me-1"></i>Best Practices
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Research asset performance history</li>
                                <li class="mb-1">• Monitor market conditions</li>
                                <li class="mb-1">• Diversify across sectors</li>
                                <li class="mb-1">• Review and adjust regularly</li>
                            </ul>
                        </div>
                        
                        <div class="alert alert-success border-0" style="border-radius: 12px; background: rgba(76,175,80,0.1);">
                            <small>
                                <i class="bi bi-info-circle me-1"></i>
                                <strong>Tip:</strong> A well-balanced portfolio combines careful asset selection with strategic multiplier usage for optimal performance.
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    let selectedAssets = [];
    let multipliers = [];

    // Contest selection change
    document.getElementById('contest_id').addEventListener('change', function() {
        const contestId = this.value;
        if (contestId) {
            loadAssets(contestId);
        } else {
            document.getElementById('availableAssets').innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-collection display-4 opacity-25"></i>
                    <p class="mt-2">Select a contest to load assets</p>
                </div>
            `;
        }
    });

    function loadAssets(contestId) {
        // Simulate loading assets - replace with actual API call
        const mockAssets = [
            {id: 1, name: 'AAPL', sector: 'Technology'},
            {id: 2, name: 'GOOGL', sector: 'Technology'},
            {id: 3, name: 'MSFT', sector: 'Technology'},
            {id: 4, name: 'TSLA', sector: 'Automotive'},
            {id: 5, name: 'AMZN', sector: 'E-commerce'}
        ];

        let html = '';
        mockAssets.forEach(asset => {
            html += `
                <div class="asset-item p-2 mb-2 border rounded" style="cursor: pointer;" onclick="selectAsset(${asset.id}, '${asset.name}', '${asset.sector}')">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${asset.name}</strong>
                            <small class="text-muted d-block">${asset.sector}</small>
                        </div>
                        <i class="bi bi-plus-circle text-success"></i>
                    </div>
                </div>
            `;
        });

        document.getElementById('availableAssets').innerHTML = html;
    }

    window.selectAsset = function(id, name, sector) {
        if (selectedAssets.find(a => a.id === id)) return;
        
        selectedAssets.push({id, name, sector});
        multipliers.push({asset_id: id, asset_name: name, multiplier: 1});
        
        updateSelectedAssets();
        updateMultipliers();
        updateHiddenInputs();
    };

    window.removeAsset = function(id) {
        selectedAssets = selectedAssets.filter(a => a.id !== id);
        multipliers = multipliers.filter(m => m.asset_id !== id);
        
        updateSelectedAssets();
        updateMultipliers();
        updateHiddenInputs();
    };

    function updateSelectedAssets() {
        let html = '';
        if (selectedAssets.length === 0) {
            html = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-wallet2 display-4 opacity-25"></i>
                    <p class="mt-2">No assets selected</p>
                </div>
            `;
        } else {
            selectedAssets.forEach(asset => {
                html += `
                    <div class="asset-item p-2 mb-2 border rounded bg-light">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong>${asset.name}</strong>
                                <small class="text-muted d-block">${asset.sector}</small>
                            </div>
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeAsset(${asset.id})">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        }
        document.getElementById('selectedAssets').innerHTML = html;
    }

    function updateMultipliers() {
        let html = '';
        if (selectedAssets.length === 0) {
            html = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-star display-4 opacity-25"></i>
                    <p class="mt-2">Select assets to configure multipliers</p>
                </div>
            `;
        } else {
            selectedAssets.forEach(asset => {
                const multiplier = multipliers.find(m => m.asset_id === asset.id);
                html += `
                    <div class="row mb-3 align-items-center">
                        <div class="col-md-6">
                            <strong>${asset.name}</strong>
                            <small class="text-muted d-block">${asset.sector}</small>
                        </div>
                        <div class="col-md-6">
                            <select class="form-select" onchange="updateMultiplier(${asset.id}, this.value)">
                                <option value="1" ${multiplier.multiplier == 1 ? 'selected' : ''}>1X</option>
                                <option value="1.5" ${multiplier.multiplier == 1.5 ? 'selected' : ''}>1.5X</option>
                                <option value="2" ${multiplier.multiplier == 2 ? 'selected' : ''}>2X</option>
                            </select>
                        </div>
                    </div>
                `;
            });
        }
        document.getElementById('multipliersSection').innerHTML = html;
    }

    window.updateMultiplier = function(assetId, value) {
        const multiplier = multipliers.find(m => m.asset_id === assetId);
        if (multiplier) {
            multiplier.multiplier = parseFloat(value);
            updateHiddenInputs();
        }
    };

    function updateHiddenInputs() {
        document.getElementById('assetsInput').value = JSON.stringify(selectedAssets);
        document.getElementById('multipliersInput').value = JSON.stringify(multipliers);
    }
});
</script>
@endsection