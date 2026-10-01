
@extends('admin.layouts.app')

@section('title', 'Edit Announcement')

@section('content')
<div class="container-fluid">
    <div class="row justify-content-center">
        <div class="col-lg-7">
            <div class="card shadow-sm mb-4">
                <div class="card-header fw-bold">Edit Announcement: {{ $announcement->title }}</div>
                <div class="card-body">
                    <form method="POST" action="{{ route('admin.announcements.update', $announcement->id) }}">
                        @csrf
                        @method('PUT')
                        <div class="mb-3">
                            <label for="title" class="form-label">Title</label>
                            <input type="text" id="title" name="title" class="form-control" value="{{ old('title', $announcement->title) }}" required>
                        </div>
                        <div class="mb-3">
                            <label for="description" class="form-label">Description</label>
                            <textarea id="description" name="description" class="form-control" rows="5" required>{{ old('description', $announcement->description) }}</textarea>
                        </div>
                        <div class="mb-3">
                            <label for="type" class="form-label">Type</label>
                            <select id="type" name="type" class="form-select" required>
                                <option value="update" {{ old('type', $announcement->type) == 'update' ? 'selected' : '' }}>Update</option>
                                <option value="alert" {{ old('type', $announcement->type) == 'alert' ? 'selected' : '' }}>Alert</option>
                                <option value="promo" {{ old('type', $announcement->type) == 'promo' ? 'selected' : '' }}>Promo</option>
                            </select>
                        </div>
                        <div class="d-flex gap-2">
                            <a href="{{ route('admin.announcements.index') }}" class="btn btn-outline-secondary">
                                <i class="bi bi-arrow-left"></i> Back
                            </a>
                            <button type="submit" class="btn btn-success">
                                <i class="bi bi-save"></i> Update Announcement
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection