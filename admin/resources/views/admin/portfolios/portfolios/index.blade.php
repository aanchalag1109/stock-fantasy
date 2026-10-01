<h1>Portfolios</h1>
<table>
    <tr><th>User</th><th>Contest</th><th>Score</th></tr>
    @foreach($portfolios as $p)
    <tr>
        <td>{{ $p->user->name }}</td>
        <td>{{ $p->contest->name }}</td>
        <td>{{ $p->total_score }}</td>
    </tr>
    @endforeach
</table>