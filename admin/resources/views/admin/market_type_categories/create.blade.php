@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-plus-circle-fill text-success me-2"></i>Create Market Category</h1>
            <p class="text-muted mb-0">Add a new category for stock or crypto markets</p>
        </div>
        <a href="{{ route('admin.market_type_categories.index') }}" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Back to Categories
        </a>
    </div>

    <div class="row">
        <div class="col-lg-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-gradient-success text-white">
                    <h5 class="mb-0"><i class="bi bi-gear-fill me-2"></i>Category Configuration</h5>
                </div>
                <div class="card-body p-4">
                    <form action="{{ route('admin.market_type_categories.store') }}" method="POST">
                        @csrf
                        
                        <!-- Basic Information -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-success mb-3"><i class="bi bi-info-circle me-2"></i>Basic Information</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="category_type" class="form-label fw-semibold">Market Type <span class="text-danger">*</span></label>
                                    <select name="category_type" id="category_type" class="form-select form-select-lg" required onchange="updatePreview()">
                                        <option value="">Choose market type</option>
                                        <option value="stock">📈 Stock Market</option>
                                        <option value="crypto">🪙 Cryptocurrency</option>
                                    </select>
                                    <div class="form-text">Select the type of market this category belongs to</div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="status" class="form-label fw-semibold">Status</label>
                                    <select name="status" id="status" class="form-select form-select-lg">
                                        <option value="active" selected>🟢 Active</option>
                                        <option value="inactive">🔴 Inactive</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Category Details -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-success mb-3"><i class="bi bi-tag me-2"></i>Category Details</h6>
                            </div>
                            <div class="col-12">
                                <div class="mb-3">
                                    <label for="name" class="form-label fw-semibold">Category Name <span class="text-danger">*</span></label>
                                    <input type="text" name="name" id="name" class="form-control form-control-lg" 
                                           placeholder="e.g., Banking, Technology, DeFi" required oninput="updatePreview()">
                                    <div class="form-text">Enter a descriptive name for this category</div>
                                </div>
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <div class="mb-3">
                                    <label for="description" class="form-label fw-semibold">Description</label>
                                    <textarea name="description" id="description" class="form-control" rows="3" 
                                              placeholder="Brief description of this category (optional)"></textarea>
                                    <div class="form-text">Provide additional details about this category</div>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="row">
                            <div class="col-12">
                                <div class="d-flex gap-3 justify-content-end">
                                    <a href="{{ route('admin.market_type_categories.index') }}" class="btn btn-outline-secondary btn-lg px-4">
                                        <i class="bi bi-x-circle me-2"></i>Cancel
                                    </a>
                                    <button type="submit" class="btn btn-success btn-lg px-4">
                                        <i class="bi bi-check-circle me-2"></i>Create Category
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Preview & Guidelines Sidebar -->
        <div class="col-lg-4">
            <!-- Preview Card -->
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-eye text-info me-2"></i>Preview</h6>
                </div>
                <div class="card-body">
                    <div id="categoryPreview" class="text-center py-3">
                        <div class="bg-light rounded-circle d-inline-flex align-items-center justify-content-center mb-2" style="width: 60px; height: 60px;">
                            <i id="previewIcon" class="bi bi-tag text-muted" style="font-size: 24px;"></i>
                        </div>
                        <div id="previewName" class="fw-bold text-muted">Category Name</div>
                        <div id="previewType" class="small text-muted">Market Type</div>
                    </div>
                </div>
            </div>

            <!-- Guidelines Card -->
            <div class="card shadow-sm border-0">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-lightbulb text-warning me-2"></i>Guidelines</h6>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <h6 class="text-primary">Naming Convention</h6>
                        <ul class="small text-muted mb-0">
                            <li>Use clear, descriptive names</li>
                            <li>Keep names concise (2-3 words max)</li>
                            <li>Use title case (e.g., "Banking Sector")</li>
                            <li>Avoid special characters</li>
                        </ul>
                    </div>
                    <div class="mb-3">
                        <h6 class="text-primary">Examples</h6>
                        <div class="small text-muted">
                            <strong>Stock:</strong> Banking, Technology, Healthcare<br>
                            <strong>Crypto:</strong> DeFi, Gaming, Layer 1
                        </div>
                    </div>
                </div>
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

.form-control, .form-select {
    border-radius: 10px;
    border: 2px solid #e9ecef;
    transition: all 0.3s ease;
}

.form-control:focus, .form-select:focus {
    border-color: #28a745;
    box-shadow: 0 0 0 0.2rem rgba(40, 167, 69, 0.25);
}

.btn {
    border-radius: 10px;
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

.text-success {
    color: #28a745 !important;
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
function updatePreview() {
    const categoryType = document.getElementById('category_type').value;
    const categoryName = document.getElementById('name').value || 'Category Name';
    
    const previewIcon = document.getElementById('previewIcon');
    const previewName = document.getElementById('previewName');
    const previewType = document.getElementById('previewType');
    
    // Update icon and colors based on type
    if (categoryType === 'stock') {
        previewIcon.className = 'bi bi-graph-up text-success';
        previewType.textContent = 'Stock Market';
        previewIcon.parentElement.className = 'bg-success bg-opacity-10 rounded-circle d-inline-flex align-items-center justify-content-center mb-2';
    } else if (categoryType === 'crypto') {
        previewIcon.className = 'bi bi-currency-bitcoin text-warning';
        previewType.textContent = 'Cryptocurrency';
        previewIcon.parentElement.className = 'bg-warning bg-opacity-10 rounded-circle d-inline-flex align-items-center justify-content-center mb-2';
    } else {
        previewIcon.className = 'bi bi-tag text-muted';
        previewType.textContent = 'Market Type';
        previewIcon.parentElement.className = 'bg-light rounded-circle d-inline-flex align-items-center justify-content-center mb-2';
    }
    
    previewName.textContent = categoryName;
}
</script>
@endsection