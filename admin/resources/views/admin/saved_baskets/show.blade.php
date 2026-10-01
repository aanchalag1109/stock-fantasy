@extends('admin.layouts.app')

@section('content')
<div class="min-vh-100" style="background: linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 50%, #a5d6a7 100%);">
    <div class="container-fluid py-4">
        <!-- Header -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h2 class="mb-1" style="color: #2e7d32; font-weight: 700;">
                                    <i class="bi bi-wallet2 me-2"></i>Portfolio Details
                                </h2>
                                <p class="text-muted mb-0">Portfolio #{{ $basket->id }} - {{ $basket->user->name ?? 'Unknown User' }}</p>
                            </div>
                            <div>
                                <a href="{{ route('admin.saved-baskets.index') }}" class="btn btn-outline-success" style="border-radius: 12px;">
                                    <i class="bi bi-arrow-left me-1"></i>Back to List
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Summary Cards -->
        <div class="row mb-4">
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-collection display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ count($basket->assets) }}</h3>
                        <p class="mb-0 opacity-75">Total Assets</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #66bb6a 0%, #4caf50 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-star display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ collect($basket->multipliers)->where('multiplier', '>', 1)->count() }}</h3>
                        <p class="mb-0 opacity-75">Multipliers Used</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #81c784 0%, #66bb6a 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-trophy display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ $basket->contest ? '#' . $basket->contest->id : 'N/A' }}</h3>
                        <p class="mb-0 opacity-75">Contest ID</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #a5d6a7 0%, #81c784 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-coin display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ $basket->contest ? $basket->contest->entry_fee . ' probcoins' : 'Standalone' }}</h3>
                        <p class="mb-0 opacity-75">Entry Fee</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="row">
            <!-- User & Contest Info -->
            <div class="col-lg-4 mb-4">
                <div class="card border-0 shadow-lg h-100" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-person-circle me-2"></i>User Information
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <div class="text-center mb-4">
                            <div class="avatar mx-auto mb-3" style="width: 80px; height: 80px; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 20px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-person text-white" style="font-size: 2rem;"></i>
                            </div>
                            <h5 class="mb-1" style="font-weight: 600;">{{ $basket->user->name ?? 'N/A' }}</h5>
                            <p class="text-muted mb-0">{{ $basket->user->mobile ?? 'N/A' }}</p>
                        </div>
                        <div class="list-group list-group-flush">
                            <div class="list-group-item border-0 px-0 py-2">
                                <div class="d-flex justify-content-between">
                                    <span class="text-muted">Email:</span>
                                    <span style="font-weight: 500;">{{ $basket->user->email ?? 'N/A' }}</span>
                                </div>
                            </div>
                            <div class="list-group-item border-0 px-0 py-2">
                                <div class="d-flex justify-content-between">
                                    <span class="text-muted">User ID:</span>
                                    <span style="font-weight: 500;">#{{ $basket->user->id ?? 'N/A' }}</span>
                                </div>
                            </div>
                        </div>
                        
                        <hr>
                        
                        <h6 class="mb-3" style="color: #2e7d32; font-weight: 600;">
                            <i class="bi bi-trophy me-1"></i>{{ $basket->contest ? 'Contest Details' : 'Basket Details' }}
                        </h6>
                        <div class="list-group list-group-flush">
                            @if($basket->contest)
                                <div class="list-group-item border-0 px-0 py-2">
                                    <div class="d-flex justify-content-between">
                                        <span class="text-muted">Category:</span>
                                        <span style="font-weight: 500;">{{ ucfirst($basket->contest->category) }}</span>
                                    </div>
                                </div>
                                <div class="list-group-item border-0 px-0 py-2">
                                    <div class="d-flex justify-content-between">
                                        <span class="text-muted">Status:</span>
                                        <span class="badge" style="background: {{ $basket->contest->status == 'upcoming' ? '#fff3cd' : '#d1edff' }}; color: {{ $basket->contest->status == 'upcoming' ? '#856404' : '#0c5460' }}; border-radius: 8px;">
                                            {{ ucfirst($basket->contest->status) }}
                                        </span>
                                    </div>
                                </div>
                            @else
                                <div class="list-group-item border-0 px-0 py-2">
                                    <div class="d-flex justify-content-between">
                                        <span class="text-muted">Type:</span>
                                        <span class="badge" style="background: #e3f2fd; color: #1565c0; border-radius: 8px;">
                                            Standalone Basket
                                        </span>
                                    </div>
                                </div>
                                <div class="list-group-item border-0 px-0 py-2">
                                    <div class="d-flex justify-content-between">
                                        <span class="text-muted">Status:</span>
                                        <span class="badge" style="background: #e8f5e8; color: #2e7d32; border-radius: 8px;">
                                            Saved
                                        </span>
                                    </div>
                                </div>
                            @endif
                            <div class="list-group-item border-0 px-0 py-2">
                                <div class="d-flex justify-content-between">
                                    <span class="text-muted">Created:</span>
                                    <span style="font-weight: 500;">{{ $basket->created_at->format('M d, Y H:i') }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Assets List -->
            <div class="col-lg-8 mb-4">
                <div class="card border-0 shadow-lg h-100" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-collection me-2"></i>Selected Assets ({{ count($basket->assets) }})
                        </h5>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover mb-0">
                                <thead style="background: #f8f9fa;">
                                    <tr>
                                        <th class="border-0 py-3 px-4" style="font-weight: 600; color: #2e7d32;">#</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">Asset</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">Sector</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">Multiplier</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @foreach($basket->assets as $index => $asset)
                                    @php
                                        $multiplier = collect($basket->multipliers)->firstWhere('asset_name', $asset['name'])['multiplier'] ?? 1.0;
                                    @endphp
                                    <tr style="border-bottom: 1px solid #f0f0f0;">
                                        <td class="py-3 px-4">
                                            <div class="avatar" style="width: 30px; height: 30px; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.8rem;">
                                                {{ $index + 1 }}
                                            </div>
                                        </td>
                                        <td class="py-3">
                                            <div>
                                                <h6 class="mb-0" style="font-weight: 600;">{{ $asset['name'] }}</h6>
                                                <small class="text-muted">Asset ID: {{ $asset['id'] ?? 'N/A' }}</small>
                                            </div>
                                        </td>
                                        <td class="py-3">
                                            <span class="badge" style="background: #e8f5e8; color: #2e7d32; border-radius: 8px;">{{ $asset['sector'] ?? 'N/A' }}</span>
                                        </td>
                                        <td class="py-3">
                                            @if($multiplier > 1)
                                                <span class="badge" style="background: {{ $multiplier == 2 ? '#fff3cd' : '#d1ecf1' }}; color: {{ $multiplier == 2 ? '#856404' : '#0c5460' }}; border-radius: 8px; font-weight: 600;">
                                                    {{ $multiplier }}X
                                                </span>
                                            @else
                                                <span class="badge" style="background: #f8f9fa; color: #6c757d; border-radius: 8px;">1X</span>
                                            @endif
                                        </td>
                                    </tr>
                                    @endforeach
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Portfolio Summary -->
        <div class="row">
            <div class="col-12">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-graph-up me-2"></i>Portfolio Summary
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <div class="row">
                            <div class="col-md-3 mb-3">
                                <div class="text-center p-3" style="background: #f8f9fa; border-radius: 12px;">
                                    <i class="bi bi-collection text-success mb-2" style="font-size: 1.5rem;"></i>
                                    <h5 class="mb-1">{{ count($basket->assets) }}</h5>
                                    <small class="text-muted">Total Assets</small>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="text-center p-3" style="background: #f8f9fa; border-radius: 12px;">
                                    <i class="bi bi-star text-warning mb-2" style="font-size: 1.5rem;"></i>
                                    <h5 class="mb-1">{{ collect($basket->multipliers)->where('multiplier', 2)->count() }}</h5>
                                    <small class="text-muted">2X Multipliers</small>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="text-center p-3" style="background: #f8f9fa; border-radius: 12px;">
                                    <i class="bi bi-star-half text-info mb-2" style="font-size: 1.5rem;"></i>
                                    <h5 class="mb-1">{{ collect($basket->multipliers)->where('multiplier', 1.5)->count() }}</h5>
                                    <small class="text-muted">1.5X Multipliers</small>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="text-center p-3" style="background: #f8f9fa; border-radius: 12px;">
                                    <i class="bi bi-clock text-primary mb-2" style="font-size: 1.5rem;"></i>
                                    <h5 class="mb-1">{{ $basket->created_at->diffForHumans() }}</h5>
                                    <small class="text-muted">Created</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection