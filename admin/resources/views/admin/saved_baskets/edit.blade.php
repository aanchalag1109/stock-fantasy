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
                            <i class="bi bi-pencil-square me-2"></i>Edit Portfolio
                        </h2>
                        <p class="mb-0 text-white opacity-75">Modify portfolio settings and asset selection</p>
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
                        <form method="POST" action="{{ route('admin.saved-baskets.update', $basket->id) }}">
                            @csrf
                            @method('PUT')
                            
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
                                            <option value="{{ $user->id }}" {{ $basket->user_id == $user->id ? 'selected' : '' }}>
                                                {{ $user->name }} ({{ $user->mobile }})
                                            </option>
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
                                            <option value="{{ $contest->id }}" {{ $basket->contest_id == $contest->id ? 'selected' : '' }}>
                                                Contest #{{ $contest->id }} - {{ $contest->category }}
                                            </option>
                                        @endforeach
                                    </select>
                                </div>
                            </div>

                            <!-- Current Assets Display -->
                            <div class="row mb-4">
                                <div class="col-12">
                                    <div class="card border-0" style="background: #e8f5e8; border-radius: 15px;">
                                        <div class="card-body p-4">
                                            <h6 class="text-success mb-3" style="font-weight: 600;">
                                                <i class="bi bi-check-circle me-2"></i>Current Assets ({{ count($basket->assets) }})
                                            </h6>
                                            <div class="row">
                                                @foreach($basket->assets as $asset)
                                                    @php
                                                        $multiplier = collect($basket->multipliers)->firstWhere('asset_name', $asset['name'])['multiplier'] ?? 1.0;
                                                    @endphp
                                                    <div class="col-md-4 mb-2">
                                                        <div class="p-2 bg-white rounded" style="border-radius: 8px;">
                                                            <div class="d-flex justify-content-between align-items-center">
                                                                <div>
                                                                    <strong class="text-success">{{ $asset['name'] }}</strong>
                                                                    <small class="text-muted d-block">{{ $asset['sector'] ?? 'N/A' }}</small>
                                                                </div>
                                                                <span class="badge" style="background: {{ $multiplier > 1 ? '#fff3cd' : '#f8f9fa' }}; color: {{ $multiplier > 1 ? '#856404' : '#6c757d' }};">
                                                                    {{ $multiplier }}X
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                @endforeach
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Asset Selection -->
                            <div class="mb-4">
                                <h5 class="text-success mb-3" style="font-weight: 600;">
                                    <i class="bi bi-collection-fill me-2"></i>Update Asset Selection
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
                                                            <p class="mt-2">Loading assets...</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <label class="form-label fw-semibold">Selected Assets</label>
                                                <div class="border rounded p-3" style="height: 300px; overflow-y: auto; background: white;">
                                                    <div id="selectedAssets">
                                                        <!-- Will be populated by JavaScript -->
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <input type="hidden" name="assets" id="assetsInput" value="{{ json_encode($basket->assets) }}">
                                    </div>
                                </div>
                            </div>

                            <!-- Multipliers -->
                            <div class="mb-4">
                                <h5 class="text-success mb-3" style="font-weight: 600;">
                                    <i class="bi bi-star-fill me-2"></i>Update Multipliers
                                </h5>
                                <div class="card border-0" style="background: #f8f9fa; border-radius: 15px;">
                                    <div class="card-body p-4">
                                        <div id="multipliersSection">
                                            <!-- Will be populated by JavaScript -->
                                        </div>
                                        <input type="hidden" name="multipliers" id="multipliersInput" value="{{ json_encode($basket->multipliers) }}">
                                    </div>
                                </div>
                            </div>

                            <div class="text-center">
                                <button type="submit" class="btn btn-lg px-5 py-3" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border: none; border-radius: 15px; color: white; font-weight: 600; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(76,175,80,0.3);">
                                    <i class="bi bi-check-circle-fill me-2"></i>Update Portfolio
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
                            <i class="bi bi-lightbulb-fill me-2"></i>Edit Guidelines
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <div class="mb-4">
                            <h6 class="text-success mb-2" style="font-weight: 600;">
                                <i class="bi bi-exclamation-triangle me-1"></i>Important Notes
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Changes affect portfolio performance</li>
                                <li class="mb-1">• Consider current market conditions</li>
                                <li class="mb-1">• Review multiplier strategy carefully</li>
                                <li class="mb-1">• Backup current settings if needed</li>
                            </ul>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="text-success mb-2" style="font-weight: 600;">
                                <i class="bi bi-star me-1"></i>Multiplier Updates
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Increase multipliers for high confidence</li>
                                <li class="mb-1">• Reduce risk with lower multipliers</li>
                                <li class="mb-1">• Balance across asset types</li>
                                <li class="mb-1">• Monitor performance impact</li>
                            </ul>
                        </div>
                        
                        <div class="mb-4">
                            <h6 class="text-success mb-2" style="font-weight: 600;">
                                <i class="bi bi-shield-check me-1"></i>Edit Best Practices
                            </h6>
                            <ul class="list-unstyled small text-muted">
                                <li class="mb-1">• Make gradual changes</li>
                                <li class="mb-1">• Test with small adjustments</li>
                                <li class="mb-1">• Keep diversification in mind</li>
                                <li class="mb-1">• Document changes for tracking</li>
                            </ul>
                        </div>
                        
                        <div class="alert alert-success border-0" style="border-radius: 12px; background: rgba(76,175,80,0.1);">
                            <small>
                                <i class="bi bi-info-circle me-1"></i>
                                <strong>Tip:</strong> Review current performance before making significant changes to asset selection or multipliers.
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
    // Initialize with existing data
    let selectedAssets = @json($basket->assets);
    let multipliers = @json($basket->multipliers);

    // Load initial data
    loadAssets({{ $basket->contest_id }});
    updateSelectedAssets();
    updateMultipliers();
    updateHiddenInputs();

    // Contest selection change
    document.getElementById('contest_id').addEventListener('change', function() {
        const contestId = this.value;
        if (contestId) {
            loadAssets(contestId);
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
            const isSelected = selectedAssets.find(a => a.id === asset.id);
            if (!isSelected) {
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
            }
        });

        if (html === '') {
            html = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-check-circle display-4 opacity-25"></i>
                    <p class="mt-2">All available assets selected</p>
                </div>
            `;
        }

        document.getElementById('availableAssets').innerHTML = html;
    }

    window.selectAsset = function(id, name, sector) {
        if (selectedAssets.find(a => a.id === id)) return;
        
        selectedAssets.push({id, name, sector});
        multipliers.push({asset_id: id, asset_name: name, multiplier: 1});
        
        loadAssets(document.getElementById('contest_id').value);
        updateSelectedAssets();
        updateMultipliers();
        updateHiddenInputs();
    };

    window.removeAsset = function(id) {
        selectedAssets = selectedAssets.filter(a => a.id !== id);
        multipliers = multipliers.filter(m => m.asset_id !== id);
        
        loadAssets(document.getElementById('contest_id').value);
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
                const multiplier = multipliers.find(m => m.asset_id === asset.id || m.asset_name === asset.name);
                const currentMultiplier = multiplier ? multiplier.multiplier : 1;
                html += `
                    <div class="row mb-3 align-items-center">
                        <div class="col-md-6">
                            <strong>${asset.name}</strong>
                            <small class="text-muted d-block">${asset.sector}</small>
                        </div>
                        <div class="col-md-6">
                            <select class="form-select" onchange="updateMultiplier(${asset.id}, '${asset.name}', this.value)">
                                <option value="1" ${currentMultiplier == 1 ? 'selected' : ''}>1X</option>
                                <option value="1.5" ${currentMultiplier == 1.5 ? 'selected' : ''}>1.5X</option>
                                <option value="2" ${currentMultiplier == 2 ? 'selected' : ''}>2X</option>
                            </select>
                        </div>
                    </div>
                `;
            });
        }
        document.getElementById('multipliersSection').innerHTML = html;
    }

    window.updateMultiplier = function(assetId, assetName, value) {
        let multiplier = multipliers.find(m => m.asset_id === assetId || m.asset_name === assetName);
        if (multiplier) {
            multiplier.multiplier = parseFloat(value);
        } else {
            multipliers.push({asset_id: assetId, asset_name: assetName, multiplier: parseFloat(value)});
        }
        updateHiddenInputs();
    };

    function updateHiddenInputs() {
        document.getElementById('assetsInput').value = JSON.stringify(selectedAssets);
        document.getElementById('multipliersInput').value = JSON.stringify(multipliers);
    }
});
</script>
@endsection