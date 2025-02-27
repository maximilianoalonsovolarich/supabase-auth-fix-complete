// =====================================================
// DIAGNÓSTICO DE PROBLEMAS DE AUTENTICACIÓN EN SUPABASE
// =====================================================
// Este script verifica el estado de las tablas de autenticación
// en Supabase y detecta posibles problemas.

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Comprueba si están definidas las variables de entorno necesarias
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌ Error: Faltan variables de entorno necesarias');
  console.log('Crea un archivo .env con las siguientes variables:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co');
  console.log('SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key');
  process.exit(1);
}

// Crear cliente de Supabase con permisos de administrador
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Credenciales de admin
const ADMIN_EMAIL = 'codemaxon@gmail.com';
const ADMIN_PASSWORD = 'admin123';

// Función principal
async function runDiagnostic() {
  console.log('\n🔍 INICIANDO DIAGNÓSTICO DE AUTENTICACIÓN\n');
  console.log(`URL de Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log('------------------------------------------------');

  try {
    // Verificar conexión
    console.log('\n1️⃣ Verificando conexión a Supabase...');
    const { data: testData, error: testError } = await supabase.from('profiles').select('count', { count: 'exact', head: true });

    if (testError) {
      throw new Error(`Error de conexión: ${testError.message}`);
    }
    console.log('✅ Conexión establecida correctamente');

    // Verificar usuario admin en auth.users
    console.log('\n2️⃣ Verificando usuario admin en auth.users...');
    const { data: adminUser, error: adminError } = await supabase.auth.admin.getUserByEmail(ADMIN_EMAIL);

    if (adminError) {
      console.log(`❌ Error al buscar usuario admin: ${adminError.message}`);
    } else if (!adminUser || !adminUser.user) {
      console.log('❌ Usuario admin no encontrado en auth.users');
    } else {
      console.log('✅ Usuario admin encontrado:');
      console.log(`   ID: ${adminUser.user.id}`);
      console.log(`   Email: ${adminUser.user.email}`);
      console.log(`   Email confirmado: ${adminUser.user.email_confirmed_at ? 'Sí' : 'No'}`);
      console.log(`   Último inicio de sesión: ${adminUser.user.last_sign_in_at || 'Nunca'}`);

      // Verificar perfil en profiles
      console.log('\n3️⃣ Verificando perfil de admin en profiles...');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', adminUser.user.id)
        .maybeSingle();

      if (profileError) {
        console.log(`❌ Error al buscar perfil: ${profileError.message}`);
      } else if (!profile) {
        console.log('❌ Perfil de admin no encontrado en public.profiles');
      } else {
        console.log('✅ Perfil de admin encontrado:');
        console.log(`   ID: ${profile.id}`);
        console.log(`   Nombre: ${profile.name}`);
        console.log(`   Email: ${profile.email}`);
        console.log(`   Es admin: ${profile.is_admin ? 'Sí' : 'No'}`);
      }

      // Verificar identidad en auth.identities
      console.log('\n4️⃣ Verificando identidad en auth.identities...');
      try {
        const { data: identity, error: identityError } = await supabase
          .rpc('get_identity_by_user_id', { user_id: adminUser.user.id });

        if (identityError) {
          throw new Error(identityError.message);
        }

        if (!identity || identity.length === 0) {
          console.log('❌ No se encontró identidad para el usuario admin');
          
          // Verificar con SQL
          const { data: rawIdentity, error: rawError } = await supabase.from('_auth_identities_view').select('*').eq('user_id', adminUser.user.id);
          if (rawError) {
            console.log(`   Error al consultar vista de identidades: ${rawError.message}`);
          } else if (!rawIdentity || rawIdentity.length === 0) {
            console.log('   Confirmado: No hay registros de identidad para este usuario');
          } else {
            console.log('   Encontrada identidad en vista alternativa:');
            console.log(`   Provider: ${rawIdentity[0].provider}`);
            console.log(`   Provider ID: ${rawIdentity[0].provider_id || 'No establecido'}`);
          }
        } else {
          console.log('✅ Identidad encontrada:');
          console.log(`   Provider: ${identity[0].provider}`);
          console.log(`   Provider ID: ${identity[0].provider_id || 'No establecido'}`);
        }
      } catch (error) {
        console.log(`❌ Error al verificar identidad: ${error.message}`);
        console.log('   Nota: Es posible que el procedimiento RPC no exista o no tengas permisos');
        
        // Intentar verificar identidad con un enfoque alternativo
        try {
          const { data, error } = await supabase.from('_auth_identities_view').select('*').eq('user_id', adminUser.user.id);
          
          if (error) {
            throw error;
          }
          
          if (!data || data.length === 0) {
            console.log('❌ No se encontró identidad para el usuario admin (método alternativo)');
          } else {
            console.log('✅ Identidad encontrada (método alternativo):');
            console.log(`   Provider: ${data[0].provider}`);
            console.log(`   Provider ID: ${data[0].provider_id || 'No establecido'}`);
          }
        } catch (innerError) {
          console.log(`❌ Error al verificar identidad (método alternativo): ${innerError.message}`);
        }
      }

      // Probar inicio de sesión
      console.log('\n5️⃣ Probando inicio de sesión...');
      try {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD
        });

        if (signInError) {
          console.log(`❌ Error de inicio de sesión: ${signInError.message}`);
          console.log('   Posibles causas:');
          console.log('   - La contraseña no es correcta o no está correctamente hasheada');
          console.log('   - El email no está confirmado');
          console.log('   - Problemas con la identidad del usuario');
        } else {
          console.log('✅ Inicio de sesión exitoso');
          console.log(`   User ID: ${signInData.user.id}`);
          console.log(`   Token recibido: ${signInData.session.access_token.substring(0, 20)}...`);
        }
      } catch (error) {
        console.log(`❌ Error inesperado al iniciar sesión: ${error.message}`);
      }
    }

  } catch (error) {
    console.error(`\n❌ ERROR GENERAL: ${error.message}`);
  }

  console.log('\n------------------------------------------------');
  console.log('🏁 DIAGNÓSTICO COMPLETADO');
  console.log('------------------------------------------------');
  
  // Sugerencias basadas en los resultados
  console.log('\n💡 SUGERENCIAS:');
  console.log('1. Si hay problemas, ejecuta el script SQL "complete-auth-fix.sql"');
  console.log('2. Usa la página de inicio de sesión directa en "direct-login.tsx"');
  console.log('3. Verifica en Supabase Dashboard -> Authentication -> Users que el admin existe y está confirmado');
  console.log('\nRecuerda: Las credenciales de admin son:');
  console.log('Email: codemaxon@gmail.com');
  console.log('Password: admin123');
  
  process.exit(0);
}

// Ejecutar el diagnóstico
runDiagnostic();