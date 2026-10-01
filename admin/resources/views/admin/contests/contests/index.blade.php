<h1>Contests</h1>
<a href="{{ route('contests.create') }}">Create Contest</a>
<table>
    <tr><th>Name</th><th>Type</th><th>Fee</th></tr>
    @foreach($contests as $contest)
    <tr>
        <td>{{ $contest->name }}</td>
        <td>{{ $contest->type }}</td>
        <td>{{ $contest->entry_fee }}</td>
    </tr>
    @endforeach
</table>