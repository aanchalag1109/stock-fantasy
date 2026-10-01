@extends('admin.layouts.app')

@section('content')
<div class="min-vh-100" style="background: linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 50%, #a5d6a7 100%);">
    <div class="container-fluid py-4">
        
        @if(session('success'))
            <div class="alert alert-success alert-dismissible fade show" role="alert">
                {{ session('success') }}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        @endif
        
        @if(session('error'))
            <div class="alert alert-danger alert-dismissible fade show" role="alert">
                {{ session('error') }}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        @endif
        
        <!-- Header -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h2 class="mb-1" style="color: #2e7d32; font-weight: 700;">
                                    <i class="bi bi-wallet2 me-2"></i>Portfolio Management
                                </h2>
                                <p class="text-muted mb-0">Manage user portfolios and saved baskets</p>
                            </div>
                            <div class="text-end">
                                <div class="d-flex gap-2">
                                    <button class="btn btn-outline-success" style="border-radius: 12px;">
                                        <i class="bi bi-download me-1"></i>Export
                                    </button>
                                    <button class="btn btn-outline-danger" id="bulkDeleteBtn" style="border-radius: 12px; display: none;" onclick="bulkDelete()">
                                        <i class="bi bi-trash me-1"></i>Delete Selected
                                    </button>
                                    <button class="btn" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border: none; border-radius: 12px; color: white;">
                                        <i class="bi bi-plus-circle me-1"></i>Create Portfolio
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Stats Cards -->
        <div class="row mb-4">
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-wallet2 display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ isset($baskets->showAll) && $baskets->showAll ? $baskets->count() : $baskets->total() }}</h3>
                        <p class="mb-0 opacity-75">Total Portfolios</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #66bb6a 0%, #4caf50 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-people display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ $baskets->unique('user_id')->count() }}</h3>
                        <p class="mb-0 opacity-75">Active Users</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #81c784 0%, #66bb6a 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-graph-up display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ $baskets->sum(function($b) { return count($b->assets); }) }}</h3>
                        <p class="mb-0 opacity-75">Total Assets</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #a5d6a7 0%, #81c784 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-star display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ $baskets->sum(function($b) { return collect($b->multipliers)->where('multiplier', '>', 1)->count(); }) }}</h3>
                        <p class="mb-0 opacity-75">Multipliers Used</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Portfolios Table -->
        <div class="row">
            <div class="col-12">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 20px 20px 0 0;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0 text-white" style="font-weight: 600;">
                                <i class="bi bi-list-ul me-2"></i>Portfolio List
                                @if(isset($baskets->showAll) && $baskets->showAll)
                                    <span class="badge bg-warning text-dark ms-2">Showing All ({{ $baskets->count() }})</span>
                                @endif
                            </h5>
                            <form method="GET" class="d-flex gap-2">
                                <select class="form-select form-select-sm" name="contest_filter" style="border-radius: 10px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white;">
                                    <option value="">All Types</option>
                                    <option value="standalone" {{ request('contest_filter') == 'standalone' ? 'selected' : '' }}>Standalone</option>
                                    <option value="contest" {{ request('contest_filter') == 'contest' ? 'selected' : '' }}>With Contest</option>
                                    <option value="deletable" {{ request('contest_filter') == 'deletable' ? 'selected' : '' }}>Deletable Only</option>
                                </select>
                                <input type="text" class="form-control form-control-sm" name="user_filter" placeholder="Search user..." value="{{ request('user_filter') }}" style="border-radius: 10px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white;">
                                <button type="submit" class="btn btn-sm btn-light" style="border-radius: 10px;">Filter</button>
                                <a href="{{ route('admin.saved-baskets.index', array_merge(request()->all(), ['show_all' => 1])) }}" class="btn btn-sm btn-warning" style="border-radius: 10px;">Show All</a>
                                <a href="{{ route('admin.saved-baskets.index') }}" class="btn btn-sm btn-secondary" style="border-radius: 10px;">Reset</a>
                            </form>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover mb-0">
                                <thead style="background: #f8f9fa;">
                                    <tr>
                                        <th class="border-0 py-3 px-4" style="font-weight: 600; color: #2e7d32;">
                                            <input type="checkbox" id="selectAll" onchange="toggleAll()">
                                        </th>
                                        <th class="border-0 py-3 px-4" style="font-weight: 600; color: #2e7d32;">Portfolio</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">User</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">Contest</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">Assets</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">Multipliers</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">Created</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #2e7d32;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @forelse($baskets as $basket)
                                    <tr style="border-bottom: 1px solid #f0f0f0;">
                                        <td class="py-4 px-4">
                                            @php
                                                $isUsedInContest = DB::table('contest_entries')->where('basket_id', $basket->id)->exists();
                                            @endphp
                                            <input type="checkbox" class="basket-checkbox" value="{{ $basket->id }}" onchange="toggleBulkDelete()" {{ $isUsedInContest ? 'disabled title="Used in contest"' : '' }}>
                                            @if($isUsedInContest)
                                                <small class="text-danger d-block">Used in contest</small>
                                            @endif
                                        </td>
                                        <td class="py-4 px-4">
                                            <div class="d-flex align-items-center">
                                                <div class="avatar me-3" style="width: 40px; height: 40px; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                                    <i class="bi bi-wallet2 text-white"></i>
                                                </div>
                                                <div>
                                                    <h6 class="mb-0" style="font-weight: 600;">Portfolio #{{ $basket->id }}</h6>
                                                    <small class="text-muted">{{ count($basket->assets) }} assets selected</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div>
                                                <h6 class="mb-0" style="font-weight: 600;">{{ $basket->user->name ?? 'N/A' }}</h6>
                                                <small class="text-muted">{{ $basket->user->mobile ?? 'N/A' }}</small>
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div>
                                                @if($basket->contest)
                                                    <h6 class="mb-1" style="font-weight: 600;">Contest #{{ $basket->contest->id }}</h6>
                                                    <span class="badge" style="background: {{ $basket->contest->status == 'upcoming' ? '#fff3cd' : '#d1edff' }}; color: {{ $basket->contest->status == 'upcoming' ? '#856404' : '#0c5460' }}; border-radius: 8px; font-size: 0.75rem;">
                                                        {{ ucfirst($basket->contest->status) }}
                                                    </span>
                                                @else
                                                    <h6 class="mb-1" style="font-weight: 600;">Standalone Basket</h6>
                                                    <span class="badge" style="background: #e3f2fd; color: #1565c0; border-radius: 8px; font-size: 0.75rem;">
                                                        No Contest
                                                    </span>
                                                @endif
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div class="d-flex flex-wrap gap-1">
                                                @foreach(array_slice($basket->assets, 0, 3) as $asset)
                                                    <span class="badge" style="background: #e8f5e8; color: #2e7d32; border-radius: 6px; font-size: 0.7rem;">{{ $asset['name'] }}</span>
                                                @endforeach
                                                @if(count($basket->assets) > 3)
                                                    <span class="badge" style="background: #f0f0f0; color: #666; border-radius: 6px; font-size: 0.7rem;">+{{ count($basket->assets) - 3 }} more</span>
                                                @endif
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div class="d-flex flex-wrap gap-1">
                                                @php $multiplierCount = collect($basket->multipliers)->where('multiplier', '>', 1)->count(); @endphp
                                                @if($multiplierCount > 0)
                                                    <span class="badge" style="background: #fff3cd; color: #856404; border-radius: 6px; font-size: 0.7rem;">
                                                        {{ $multiplierCount }} Multipliers
                                                    </span>
                                                @else
                                                    <span class="text-muted small">No multipliers</span>
                                                @endif
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div>
                                                <small class="text-muted">{{ $basket->created_at->format('M d, Y') }}</small><br>
                                                <small class="text-muted">{{ $basket->created_at->format('H:i') }}</small>
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div class="d-flex gap-1">
                                                <a href="{{ route('admin.saved-baskets.show', $basket->id) }}" class="btn btn-sm" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border: none; border-radius: 8px; color: white;" title="View Details">
                                                    <i class="bi bi-eye"></i>
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                    @empty
                                    <tr>
                                        <td colspan="8" class="text-center py-5">
                                            <div class="text-muted">
                                                <i class="bi bi-wallet2 display-4 mb-3 opacity-25"></i>
                                                <h5 class="text-muted">No portfolios found</h5>
                                                <p class="mb-0">No saved portfolios available at the moment.</p>
                                            </div>
                                        </td>
                                    </tr>
                                    @endforelse
                                </tbody>
                            </table>
                        </div>
                        
                        @if(!isset($baskets->showAll) || !$baskets->showAll)
                            @if($baskets->hasPages())
                            <div class="card-footer border-0 py-4" style="background: #f8f9fa; border-radius: 0 0 20px 20px;">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div class="text-muted small">
                                        Showing {{ $baskets->firstItem() }} to {{ $baskets->lastItem() }} of {{ $baskets->total() }} results
                                    </div>
                                    <div>
                                        {{ $baskets->appends(request()->query())->links('pagination::bootstrap-4') }}
                                    </div>
                                </div>
                            </div>
                            @endif
                        @else
                            <div class="card-footer border-0 py-3" style="background: #f8f9fa; border-radius: 0 0 20px 20px;">
                                <div class="text-center text-muted small">
                                    Showing all {{ $baskets->count() }} results
                                </div>
                            </div>
                        @endif
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function toggleAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.basket-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    toggleBulkDelete();
}

function toggleBulkDelete() {
    const checkboxes = document.querySelectorAll('.basket-checkbox:checked');
    const bulkBtn = document.getElementById('bulkDeleteBtn');
    bulkBtn.style.display = checkboxes.length > 0 ? 'block' : 'none';
}

function bulkDelete() {
    const selected = Array.from(document.querySelectorAll('.basket-checkbox:checked')).map(cb => cb.value);
    if (selected.length === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selected.length} selected baskets?`)) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/admin/saved-baskets/bulk-delete';
        
        const token = document.createElement('input');
        token.type = 'hidden';
        token.name = '_token';
        token.value = '{{ csrf_token() }}';
        form.appendChild(token);
        
        selected.forEach(id => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'basket_ids[]';
            input.value = id;
            form.appendChild(input);
        });
        
        document.body.appendChild(form);
        form.submit();
    }
}
</script>
@endsection