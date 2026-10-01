@extends('admin.layouts.app')
@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-plus-circle-fill text-info me-2"></i>Create New Banner</h1>
            <p class="text-muted mb-0">Add a new promotional banner or advertisement</p>
        </div>
        <a href="{{ route('admin.banners.index') }}" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Back to Banners
        </a>
    </div>

    <div class="row">
        <div class="col-lg-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-gradient-info text-white">
                    <h5 class="mb-0"><i class="bi bi-gear-fill me-2"></i>Banner Configuration</h5>
                </div>
                <div class="card-body p-4">
                    <form action="{{ route('admin.banners.store') }}" method="POST" enctype="multipart/form-data">
                        @csrf
                        
                        <!-- Basic Information -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-info mb-3"><i class="bi bi-info-circle me-2"></i>Basic Information</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="title" class="form-label fw-semibold">Banner Title <span class="text-danger">*</span></label>
                                    <input type="text" name="title" id="title" class="form-control form-control-lg" 
                                           placeholder="Enter banner title" required>
                                    <div class="form-text">This will be used as alt text for the image</div>
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

                        <!-- Description -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <div class="mb-3">
                                    <label for="description" class="form-label fw-semibold">Description</label>
                                    <textarea name="description" id="description" class="form-control" rows="3" 
                                              placeholder="Brief description of the banner (optional)"></textarea>
                                </div>
                            </div>
                        </div>

                        <!-- Image Upload -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-info mb-3"><i class="bi bi-image me-2"></i>Banner Image</h6>
                            </div>
                            <div class="col-12">
                                <div class="mb-3">
                                    <label for="image" class="form-label fw-semibold">Upload Image <span class="text-danger">*</span></label>
                                    <input type="file" name="image" id="image" class="form-control form-control-lg" 
                                           accept="image/*" required onchange="previewImage(this)">
                                    <div class="form-text">Supported formats: JPG, PNG, GIF. Recommended size: 1200x400px</div>
                                </div>
                                <!-- Image Preview -->
                                <div id="imagePreview" class="mt-3" style="display: none;">
                                    <div class="card border-0 bg-light">
                                        <div class="card-body text-center">
                                            <h6 class="text-muted mb-2">Preview</h6>
                                            <img id="previewImg" src="" alt="Preview" class="img-fluid rounded shadow-sm" style="max-height: 200px;">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Link Settings -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-info mb-3"><i class="bi bi-link-45deg me-2"></i>Link Settings</h6>
                            </div>
                            <div class="col-12">
                                <div class="mb-3">
                                    <label for="link" class="form-label fw-semibold">Target Link</label>
                                    <input type="url" name="link" id="link" class="form-control form-control-lg" 
                                           placeholder="https://example.com (optional)">
                                    <div class="form-text">URL to redirect when banner is clicked (leave empty for no link)</div>
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="row">
                            <div class="col-12">
                                <div class="d-flex gap-3 justify-content-end">
                                    <a href="{{ route('admin.banners.index') }}" class="btn btn-outline-secondary btn-lg px-4">
                                        <i class="bi bi-x-circle me-2"></i>Cancel
                                    </a>
                                    <button type="submit" class="btn btn-info btn-lg px-4">
                                        <i class="bi bi-check-circle me-2"></i>Create Banner
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Tips Sidebar -->
        <div class="col-lg-4">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-lightbulb text-warning me-2"></i>Tips & Guidelines</h6>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <h6 class="text-primary">Image Guidelines</h6>
                        <ul class="small text-muted mb-0">
                            <li>Use high-quality images (min 1200px width)</li>
                            <li>Keep file size under 2MB</li>
                            <li>Use JPG for photos, PNG for graphics</li>
                            <li>Ensure text is readable on mobile</li>
                        </ul>
                    </div>
                    <div class="mb-3">
                        <h6 class="text-primary">Best Practices</h6>
                        <ul class="small text-muted mb-0">
                            <li>Keep titles short and descriptive</li>
                            <li>Test links before publishing</li>
                            <li>Use compelling call-to-action</li>
                            <li>Consider mobile responsiveness</li>
                        </ul>
                    </div>
                </div>
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

.form-control, .form-select {
    border-radius: 10px;
    border: 2px solid #e9ecef;
    transition: all 0.3s ease;
}

.form-control:focus, .form-select:focus {
    border-color: #17a2b8;
    box-shadow: 0 0 0 0.2rem rgba(23, 162, 184, 0.25);
}

.btn {
    border-radius: 10px;
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

.text-info {
    color: #17a2b8 !important;
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
function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('previewImg').src = e.target.result;
            document.getElementById('imagePreview').style.display = 'block';
        }
        reader.readAsDataURL(input.files[0]);
    }
}
</script>
@endsection
