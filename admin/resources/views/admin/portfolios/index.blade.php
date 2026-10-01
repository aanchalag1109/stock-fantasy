@extends('admin.layouts.app')

@section('content')

<div class="container py-4">
    <div class="row justify-content-center">
        <div class="col-md-11">
            <div class="card shadow-sm border-0">
                <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <h4 class="mb-0 fw-bold text-white">Portfolios</h4>
                    <a href="{{ route('admin.portfolios.create') }}" class="btn btn-success">+ Create New Portfolio</a>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>ID</th>
                                    <th>User</th>
                                    <th>Contest</th>
                                    <th>Total Score</th>
                                    <th>Rank</th>
                                    <th>Winnings</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($portfolios as $portfolio)
                                <tr>
                                    <td>{{ $portfolio->id }}</td>
                                    <td>{{ $portfolio->user ? $portfolio->user->name : 'N/A' }}</td>
                                    <td>{{ $portfolio->contest ? $portfolio->contest->name : 'N/A' }}</td>
                                    <td>{{ $portfolio->total_score }}</td>
                                    <td>
                                        @if($portfolio->rank)
                                            <span class="badge bg-info">{{ $portfolio->rank }}</span>
                                        @else
                                            <span class="text-muted">N/A</span>
                                        @endif
                                    </td>
                                    <td>{{ $portfolio->winnings }}</td>
                                    <td>
                                        <a href="{{ route('admin.portfolios.edit', $portfolio->id) }}" class="btn btn-sm btn-primary me-1">Edit</a>
                                        <form action="{{ route('admin.portfolios.destroy', $portfolio->id) }}" method="POST" class="d-inline">
                                            @csrf
                                            @method('DELETE')
                                            <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Are you sure you want to delete this portfolio?')">Delete</button>
                                        </form>
                                    </td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                    @if(method_exists($portfolios, 'links'))
                    <div class="card-footer bg-white py-3">
                        <nav>
                            {!! $portfolios->withQueryString()->links('pagination::bootstrap-5') !!}
                        </nav>
                    </div>
                    @endif
                </div>
            </div>
        </div>
    </div>
</div>
@endsection