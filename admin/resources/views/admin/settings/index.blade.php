@extends('admin.layouts.app')

@section('title', 'Settings')

@section('content')
<div class="container py-5">
    <div class="row justify-content-center">
        <div class="col-lg-10">
            <div class="card shadow-lg border-0 mb-4">
                <div class="card-header bg-primary text-white d-flex align-items-center">
                    <i class="bi bi-gear me-2" style="font-size:1.5rem;"></i>
                    <h2 class="mb-0" style="color: #fff;">Admin Settings</h2>
                </div>
                <div class="card-body">
                    <div class="row g-4">
                        <!-- Payment API Field -->
                        <div class="col-md-12">
                            <div class="card h-100 border-0 bg-light">
                                <div class="card-body">
                                    <h5 class="card-title"><i class="bi bi-credit-card me-2"></i>Payment API Key</h5>
                                    
                                        <form action="{{ route('admin.settings.payment') }}" method="POST" class="mt-3">
                                        @csrf
                                        <div class="mb-3">
                                            <label for="payment_api" class="form-label">Payment API Key</label>
                                            <input type="text" name="payment_api" id="payment_api" class="form-control" value="{{ old('payment_api', $settings['payment_api'] ?? '') }}">
                                        </div>
                                        <button type="submit" class="btn btn-primary">Save Payment API Key</button>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <!-- Terms & Conditions -->
                        <div class="col-md-12">
                            <div class="card h-100 border-0 bg-light">
                                <div class="card-body">
                                    <h5 class="card-title"><i class="bi bi-file-earmark-text me-2"></i>Terms & Conditions</h5>
                                  
                                        <form action="{{ route('admin.settings.terms') }}" method="POST" class="mt-3">
                                        @csrf
                                        <div class="mb-3">
                                            <label for="terms" class="form-label">Terms & Conditions</label>
                                            <textarea name="terms" id="terms" rows="5" class="form-control summernote">{{ old('terms', $settings['terms'] ?? '') }}</textarea>
                                        </div>
                                        <button type="submit" class="btn btn-primary">Update Terms</button>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <!-- Privacy Policy -->
                        <div class="col-md-12">
                            <div class="card h-100 border-0 bg-light">
                                <div class="card-body">
                                    <h5 class="card-title"><i class="bi bi-shield-lock me-2"></i>Privacy Policy</h5>
                                  
                                        <form action="{{ route('admin.settings.privacy') }}" method="POST" class="mt-3">
                                        @csrf
                                        <div class="mb-3">
                                            <label for="privacy" class="form-label">Privacy Policy</label>
                                            <textarea name="privacy" id="privacy" rows="5" class="form-control summernote">{{ old('privacy', $settings['privacy'] ?? '') }}</textarea>
                                        </div>
                                        <button type="submit" class="btn btn-primary">Update Privacy Policy</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                        
                            <!-- About -->
                            <div class="col-md-12">
                                <div class="card h-100 border-0 bg-light">
                                    <div class="card-body">
                                        <h5 class="card-title"><i class="bi bi-info-circle me-2"></i>About</h5>
                                        <form action="{{ route('admin.settings.about') }}" method="POST" class="mt-3">
                                            @csrf
                                            <div class="mb-3">
                                                <label for="about" class="form-label">About</label>
                                                <textarea name="about" id="about" rows="5" class="form-control summernote">{{ old('about', $settings['about'] ?? '') }}</textarea>
                                            </div>
                                            <button type="submit" class="btn btn-primary">Update About</button>
                                        </form>
                                    </div>
                                </div>
                            </div>

                            <!-- Payment Policy -->
                            <div class="col-md-12">
                                <div class="card h-100 border-0 bg-light">
                                    <div class="card-body">
                                        <h5 class="card-title"><i class="bi bi-cash-coin me-2"></i>Payment Policy</h5>
                                        <form action="{{ route('admin.settings.payment_policy') }}" method="POST" class="mt-3">
                                            @csrf
                                            <div class="mb-3">
                                                <label for="payment_policy" class="form-label">Payment Policy</label>
                                                <textarea name="payment_policy" id="payment_policy" rows="5" class="form-control summernote">{{ old('payment_policy', $settings['payment_policy'] ?? '') }}</textarea>
                                            </div>
                                            <button type="submit" class="btn btn-primary">Update Payment Policy</button>
                                        </form>
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


<!-- include libraries(jQuery, bootstrap) -->
<link href="https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/cs/bootstrap.min.css" rel="stylesheet">
<script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>

<!-- include summernote css/js -->
<link href="https://cdn.jsdelivr.net/npm/summernote@0.9.0/dist/summernote.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/summernote@0.9.0/dist/summernote.min.js"></script>
<script>
    $(document).ready(function() {
        $('.summernote').summernote({
            height: 300,
            toolbar: [
                ['style', ['bold', 'italic', 'underline', 'clear']],
                ['font', ['strikethrough', 'superscript', 'subscript']],
                ['para', ['ul', 'ol', 'paragraph']],
                ['insert', ['link']],
                ['view', ['codeview']]
            ]
        });
    });
</script>
