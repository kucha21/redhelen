# RedHelen • რედჰელენი — V2.1

ეს ვერსია მომზადებულია PostgreSQL + Render-ზე გასაშვებად. SQLite აღარ გამოიყენება.

## ტელეფონით გაკეთების გეგმა
1. GitHub-ში გახსენი `kucha21/redhelen`.
2. ატვირთე ამ საქაღალდის ყველა ფაილი და საქაღალდე (`public`-იც).
3. Render-ში შედი და აირჩიე GitHub → `kucha21/redhelen`.
4. Web Service-ის Build Command: `npm install`; Start Command: `npm start`.
5. PostgreSQL Database შექმენი და მისი `DATABASE_URL` მიაბი Web Service-ს.
6. დაამატე `ADMIN_PASSWORD` და `SESSION_SECRET`.
7. გაშვების შემდეგ შეამოწმე `/health`.
8. Admin: `/admin/login`.

## მთავარი ფუნქციები
- ქართული / English / Русский
- პროდუქტები და კატეგორიები
- კალათა
- შეკვეთის ფორმა
- შეკვეთების მართვა
- სტატუსები
- შემოსავალი და მოგების დათვლა
- CSV ექსპორტი
- Admin პანელი
- PostgreSQL მონაცემთა ბაზა
- Render-ready კონფიგურაცია

## მნიშვნელოვანი
`ADMIN_PASSWORD` და `SESSION_SECRET` არ ატვირთო GitHub-ში. Render-ში Environment Variables-ში ჩაწერე.

შემდეგ ეტაპზე შესაძლებელია TBC/BOG ონლაინ გადახდის ინტეგრაცია, ელფოსტა/SMS, პროდუქტის ფოტოების ატვირთვა და `redhelen.ge` დომენის მიბმა.
