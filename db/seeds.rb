# Create identities and users for allowed users
[
  { email: "ivor.kovic@fiumed.hr", name: "Ivor" },
  { email: "marija.vidacic@fiumed.hr", name: "Marija" }
].each do |data|
  identity = Identity.find_or_create_by!(email_address: data[:email])
  identity.users.find_or_create_by!(name: data[:name])
  puts "Created user #{data[:name]} (#{data[:email]})"
end
