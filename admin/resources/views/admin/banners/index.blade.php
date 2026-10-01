@extends('admin.layouts.app')
@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-images text-info me-2"></i>Banner Management</h1>
            <p class="text-muted mb-0">Manage promotional banners and advertisements</p>
        </div>
        <a href="{{ route('admin.banners.create') }}" class="btn btn-info btn-lg">
            <i class="bi bi-plus-circle me-2"></i>Add New Banner
        </a>
    </div>

    <div class="card shadow-sm border-0">
        <div class="card-header bg-gradient-info text-white">
            <h5 class="mb-0"><i class="bi bi-collection-fill me-2"></i>All Banners</h5>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th class="fw-semibold"><i class="bi bi-card-text me-1"></i>Title</th>
                            <th class="fw-semibold"><i class="bi bi-image me-1"></i>Preview</th>
                            <th class="fw-semibold"><i class="bi bi-link-45deg me-1"></i>Link</th>
                            <th class="fw-semibold"><i class="bi bi-circle-fill me-1"></i>Status</th>
                            <th class="fw-semibold text-center"><i class="bi bi-gear me-1"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($banners as $banner)
                        <tr>
                            <td>
                                <div class="fw-semibold text-dark">{{ $banner->title }}</div>
                                @if($banner->description)
                                    <small class="text-muted">{{ Str::limit($banner->description, 50) }}</small>
                                @endif
                            </td>
                            <td>
                                <div class="position-relative">
                                    <img src="{{ asset($banner->image) }}" alt="{{ $banner->title }}" 
                                         class="rounded shadow-sm" style="width: 120px; height: 60px; object-fit: cover;">
                                    <div class="position-absolute top-0 end-0">
                                        <span class="badge bg-dark bg-opacity-75 text-white small">{{ pathinfo($banner->image, PATHINFO_EXTENSION) }}</span>
                                    </div>
                                </div>
                            </td>
                            <td>
                                @if($banner->link)
                                    <a href="{{ $banner->link }}" target="_blank" class="text-decoration-none">
                                        <i class="bi bi-box-arrow-up-right me-1"></i>
                                        {{ Str::limit($banner->link, 30) }}
                                    </a>
                                @else
                                    <span class="text-muted">No link</span>
                                @endif
                            </td>
                            <td>
                                <span class="badge {{ $banner->status == 'active' ? 'bg-success' : 'bg-secondary' }} fs-6">
                                    <i class="bi bi-{{ $banner->status == 'active' ? 'check' : 'x' }}-circle me-1"></i>
                                    {{ ucfirst($banner->status) }}
                                </span>
                            </td>
                            <td class="text-center">
                                <div class="btn-group btn-group-sm">
                                    <a href="{{ route('admin.banners.edit', $banner) }}" class="btn btn-outline-warning" title="Edit Banner">
                                        <i class="bi bi-pencil"></i>
                                    </a>
                                    <form action="{{ route('admin.banners.destroy', $banner) }}" method="POST" class="d-inline">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-outline-danger" title="Delete Banner" 
                                                onclick="return confirm('Are you sure you want to delete this banner?')">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="5" class="text-center py-5">
                                <div class="text-muted">
                                    <i class="bi bi-images display-1 d-block mb-3"></i>
                                    <h5>No banners found</h5>
                                    <p>Create your first banner to get started.</p>
                                    <a href="{{ route('admin.banners.create') }}" class="btn btn-info">
                                        <i class="bi bi-plus-circle me-1"></i>Add New Banner
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
.bg-gradient-info {
    background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
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

.btn-info {
    background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);
    border: none;
}

.btn-info:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(23, 162, 184, 0.4);
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
