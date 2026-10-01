@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-tags text-success me-2"></i>Market Categories</h1>
            <p class="text-muted mb-0">Manage stock and crypto market categories</p>
        </div>
        <a href="{{ route('admin.market_type_categories.create') }}" class="btn btn-success btn-lg">
            <i class="bi bi-plus-circle me-2"></i>Add New Category
        </a>
    </div>

    @if(session('success'))
        <div class="alert alert-success border-0 shadow-sm mb-4">
            <i class="bi bi-check-circle-fill me-2"></i>{{ session('success') }}
        </div>
    @endif

    <!-- Filter Tabs -->
    <div class="card shadow-sm border-0 mb-4">
        <div class="card-body">
            <div class="btn-group" role="group">
                <a href="?type=stock" class="btn {{ request('type') == 'stock' ? 'btn-success' : 'btn-outline-success' }}">
                    <i class="bi bi-graph-up me-1"></i>Stock Categories
                    <span class="badge bg-light text-dark ms-1">{{ $categories->where('category_type', 'stock')->count() }}</span>
                </a>
                <a href="?type=crypto" class="btn {{ request('type') == 'crypto' ? 'btn-warning' : 'btn-outline-warning' }}">
                    <i class="bi bi-currency-bitcoin me-1"></i>Crypto Categories
                    <span class="badge bg-light text-dark ms-1">{{ $categories->where('category_type', 'crypto')->count() }}</span>
                </a>
                <a href="{{ route('admin.market_type_categories.index') }}" class="btn {{ !request('type') ? 'btn-dark' : 'btn-outline-dark' }}">
                    <i class="bi bi-list me-1"></i>All Categories
                    <span class="badge bg-light text-dark ms-1">{{ $categories->count() }}</span>
                </a>
            </div>
        </div>
    </div>

    <div class="card shadow-sm border-0">
        <div class="card-header bg-gradient-success text-white">
            <h5 class="mb-0"><i class="bi bi-collection-fill me-2"></i>All Categories</h5>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th class="fw-semibold">#</th>
                            <th class="fw-semibold"><i class="bi bi-tag me-1"></i>Category Name</th>
                            <th class="fw-semibold"><i class="bi bi-diagram-3 me-1"></i>Market Type</th>
                            <th class="fw-semibold"><i class="bi bi-circle-fill me-1"></i>Status</th>
                            <th class="fw-semibold"><i class="bi bi-calendar me-1"></i>Created</th>
                            <th class="fw-semibold text-center"><i class="bi bi-gear me-1"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($categories as $category)
                        <tr>
                            <td>
                                <div class="d-flex align-items-center">
                                    <div class="bg-{{ $category->category_type == 'stock' ? 'success' : 'warning' }} rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;">
                                        <i class="bi bi-{{ $category->category_type == 'stock' ? 'graph-up' : 'currency-bitcoin' }} text-white"></i>
                                    </div>
                                    <span class="ms-2 fw-semibold">{{ $category->id }}</span>
                                </div>
                            </td>
                            <td>
                                <div class="fw-semibold text-dark">{{ $category->name }}</div>
                                @if($category->description)
                                    <small class="text-muted">{{ Str::limit($category->description, 50) }}</small>
                                @endif
                            </td>
                            <td>
                                <span class="badge {{ $category->category_type == 'stock' ? 'bg-success' : 'bg-warning' }} fs-6">
                                    <i class="bi bi-{{ $category->category_type == 'stock' ? 'graph-up' : 'currency-bitcoin' }} me-1"></i>
                                    {{ ucfirst($category->category_type) }}
                                </span>
                            </td>
                            <td>
                                <span class="badge {{ $category->status == 'active' ? 'bg-success' : 'bg-secondary' }} fs-6">
                                    <i class="bi bi-{{ $category->status == 'active' ? 'check' : 'x' }}-circle me-1"></i>
                                    {{ ucfirst($category->status) }}
                                </span>
                            </td>
                            <td>
                                <div class="small">
                                    <div class="fw-semibold">{{ $category->created_at ? $category->created_at->format('M j, Y') : 'N/A' }}</div>
                                    <div class="text-muted">{{ $category->created_at ? $category->created_at->format('H:i') : '' }}</div>
                                </div>
                            </td>
                            <td class="text-center">
                                <div class="btn-group btn-group-sm">
                                    <a href="{{ route('admin.market_type_categories.edit', $category) }}" class="btn btn-outline-warning" title="Edit Category">
                                        <i class="bi bi-pencil"></i>
                                    </a>
                                    <form action="{{ route('admin.market_type_categories.destroy', $category) }}" method="POST" class="d-inline">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-outline-danger" title="Delete Category" 
                                                onclick="return confirm('Are you sure you want to delete this category?')">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="6" class="text-center py-5">
                                <div class="text-muted">
                                    <i class="bi bi-tags display-1 d-block mb-3"></i>
                                    <h5>No categories found</h5>
                                    <p>Create your first market category to get started.</p>
                                    <a href="{{ route('admin.market_type_categories.create') }}" class="btn btn-success">
                                        <i class="bi bi-plus-circle me-1"></i>Add New Category
                                    </a>
                                </div>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<style>
.bg-gradient-success {
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
}

.card {
    border-radius: 15px;
    transition: all 0.3s ease;
}

.btn {
    border-radius: 8px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.btn-success {
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
    border: none;
}

.btn-success:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(40, 167, 69, 0.4);
}

.table tbody tr:hover {
    background-color: #f8f9fa;
    transform: scale(1.01);
    transition: all 0.2s ease;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.card {
    animation: fadeIn 0.5s ease-out;
}
</style>
@endsection