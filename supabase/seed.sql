-- Circles V1.1.0 - Seed data

-- Prompts library
INSERT INTO prompts (text_en, text_ja, text_zh, category) VALUES
(
    'Find a cafe or restaurant none of you have tried before and go together this week',
    '今週、まだ誰も行ったことのないカフェやレストランを見つけて、みんなで行ってみましょう',
    '本周找一家你们都没去过的咖啡馆或餐厅，一起去试试',
    'exploration'
),
(
    'Share one thing you''ve been curious about lately and discuss it',
    '最近気になっていることを一つシェアして、みんなで話し合いましょう',
    '分享一件你最近好奇的事情，一起讨论',
    'conversation'
),
(
    'Take a walk together with no destination - turn whenever someone says ''turn''',
    '目的地を決めずに一緒に散歩しましょう。誰かが「曲がって」と言ったら曲がります',
    '一起散步，没有目的地——每当有人说"转弯"就转弯',
    'exploration'
),
(
    'Everyone recommend one song and create a shared playlist',
    'それぞれ1曲ずつおすすめの曲を出し合って、プレイリストを作りましょう',
    '每人推荐一首歌，创建一个共享播放列表',
    'creative'
),
(
    'Share a photo of something interesting you saw this week',
    '今週見つけた面白いものの写真をシェアしましょう',
    '分享一张你这周看到的有趣事物的照片',
    'social'
),
(
    'Find a spot with a nice view and spend 20 minutes there together',
    '景色の良い場所を見つけて、20分間一緒に過ごしましょう',
    '找一个风景好的地方，一起待20分钟',
    'exploration'
),
(
    'Each person share a skill or hobby they could teach the others',
    'みんなに教えられるスキルや趣味を一人ずつシェアしましょう',
    '每个人分享一个可以教给别人的技能或爱好',
    'social'
),
(
    'Try the same dish at different places and compare your experiences',
    '同じ料理を別々のお店で食べて、感想を比べてみましょう',
    '在不同的地方尝试同一道菜，比较体验',
    'exploration'
),
(
    'Share something you''re grateful for this week',
    '今週感謝していることをシェアしましょう',
    '分享你这周感恩的事情',
    'conversation'
),
(
    'Visit a local shop or business you''ve always walked past but never entered',
    'いつも通り過ぎているけど入ったことのない地元のお店に行ってみましょう',
    '去一家你总是路过但从未进去过的本地商店',
    'exploration'
);
