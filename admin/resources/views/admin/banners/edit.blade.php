@extends('admin.layouts.app')
@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-pencil-square text-warning me-2"></i>Edit Banner</h1>
            <p class="text-muted mb-0">Modify banner settings and content</p>
        </div>
        <a href="{{ route('admin.banners.index') }}" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-1"></i>Back to Banners
        </a>
    </div>

    <div class="row">
        <div class="col-lg-8">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-gradient-warning text-white">
                    <h5 class="mb-0"><i class="bi bi-gear-fill me-2"></i>Banner Configuration</h5>
                </div>
                <div class="card-body p-4">
                    <form action="{{ route('admin.banners.update', $banner) }}" method="POST" enctype="multipart/form-data">
                        @csrf
                        @method('PUT')
                        
                        <!-- Basic Information -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-info-circle me-2"></i>Basic Information</h6>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="title" class="form-label fw-semibold">Banner Title <span class="text-danger">*</span></label>
                                    <input type="text" name="title" id="title" class="form-control form-control-lg" 
                                           value="{{ $banner->title }}" placeholder="Enter banner title" required>
                                    <div class="form-text">This will be used as alt text for the image</div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label for="status" class="form-label fw-semibold">Status</label>
                                    <select name="status" id="status" class="form-select form-select-lg">
                                        <option value="active" @if($banner->status == 'active') selected @endif>🟢 Active</option>
                                        <option value="inactive" @if($banner->status == 'inactive') selected @endif>🔴 Inactive</option>
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
                                              placeholder="Brief description of the banner (optional)">{{ $banner->description ?? '' }}</textarea>
                                </div>
                            </div>
                        </div>

                        <!-- Current Image & Upload -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-image me-2"></i>Banner Image</h6>
                            </div>
                            @if($banner->image)
                            <div class="col-12 mb-3">
                                <div class="card border-0 bg-light">
                                    <div class="card-body text-center">
                                        <h6 class="text-muted mb-2">Current Image</h6>
                                        <img src="/{{ $banner->image }}" alt="Current Banner" 
                                             class="img-fluid rounded shadow-sm" style="max-height: 200px;">
                                        <div class="mt-2">
                                            <small class="text-muted">{{ basename($banner->image) }}</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            @endif
                            <div class="col-12">
                                <div class="mb-3">
                                    <label for="image" class="form-label fw-semibold">Upload New Image</label>
                                    <input type="file" name="image" id="image" class="form-control form-control-lg" 
                                           accept="image/*" onchange="previewImage(this)">
                                    <div class="form-text">Leave empty to keep current image. Supported: JPG, PNG, GIF</div>
                                </div>
                                <!-- New Image Preview -->
                                <div id="imagePreview" class="mt-3" style="display: none;">
                                    <div class="card border-0 bg-light">
                                        <div class="card-body text-center">
                                            <h6 class="text-muted mb-2">New Image Preview</h6>
                                            <img id="previewImg" src="" alt="Preview" class="img-fluid rounded shadow-sm" style="max-height: 200px;">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Link Settings -->
                        <div class="row mb-4">
                            <div class="col-12">
                                <h6 class="text-warning mb-3"><i class="bi bi-link-45deg me-2"></i>Link Settings</h6>
                            </div>
                            <div class="col-12">
                                <div class="mb-3">
                                    <label for="link" class="form-label fw-semibold">Target Link</label>
                                    <input type="url" name="link" id="link" class="form-control form-control-lg" 
                                           value="{{ $banner->link }}" placeholder="https://example.com (optional)">
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
                                    <button type="submit" class="btn btn-warning btn-lg px-4">
                                        <i class="bi bi-check-circle me-2"></i>Update Banner
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Info Sidebar -->
        <div class="col-lg-4">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="bi bi-info-circle text-info me-2"></i>Banner Information</h6>
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <h6 class="text-primary">Current Status</h6>
                        <span class="badge {{ $banner->status == 'active' ? 'bg-success' : 'bg-secondary' }} fs-6">
                            {{ ucfirst($banner->status) }}
                        </span>
                    </div>
                    @if($banner->created_at)
                    <div class="mb-3">
                        <h6 class="text-primary">Created</h6>
                        <small class="text-muted">{{ $banner->created_at->format('M d, Y H:i') }}</small>
                    </div>
                    @endif
                    @if($banner->updated_at)
                    <div class="mb-3">
                        <h6 class="text-primary">Last Updated</h6>
                        <small class="text-muted">{{ $banner->updated_at->format('M d, Y H:i') }}</small>
                    </div>
                    @endif
                    @if($banner->image)
                    <div class="mb-3">
                        <h6 class="text-primary">Image Details</h6>
                        <small class="text-muted d-block">File: {{ basename($banner->image) }}</small>
                        <small class="text-muted d-block">Type: {{ strtoupper(pathinfo($banner->image, PATHINFO_EXTENSION)) }}</small>
                    </div>
                    @endif
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.bg-gradient-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff8c00 100%);
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
    border-color: #ffc107;
    box-shadow: 0 0 0 0.2rem rgba(255, 193, 7, 0.25);
}

.btn {
    border-radius: 10px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.btn-warning {
    background: linear-gradient(135deg, #ffc107 0%, #ff8c00 100%);
    border: none;
    color: white;
}

.btn-warning:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(255, 193, 7, 0.4);
    color: white;
}

.text-warning {
    color: #ffc107 !important;
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
